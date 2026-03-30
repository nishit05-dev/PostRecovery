'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  askVoiceAssistantAction,
  submitVoiceCheckInAction,
  type VoiceActionState,
  type VoiceCheckInActionState,
} from '../app/actions';

type ContinuousVoiceCompanionProps = {
  patientId: string;
  patientName: string;
  latestCheckInAt?: string;
  defaultLanguage?: 'en' | 'hi';
};

type Message = {
  speaker: 'user' | 'assistant' | 'system';
  text: string;
};

type CheckInDraft = {
  symptomLabel: string;
  symptomSeverity: number;
  symptomNotes: string;
  medicationAdherence: number;
  temperatureC: number;
  oxygenSaturation: number;
  pulse: number;
  appetite: 'good' | 'reduced' | 'poor';
  mobility: 'independent' | 'limited' | 'very-limited';
};

type CheckInStep =
  | 'symptom'
  | 'severity'
  | 'medication'
  | 'vitals'
  | 'appetite'
  | 'mobility'
  | 'notes';

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
};

type BrowserWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};

const defaultDraft: CheckInDraft = {
  symptomLabel: 'general discomfort',
  symptomSeverity: 4,
  symptomNotes: '',
  medicationAdherence: 0.9,
  temperatureC: 36.8,
  oxygenSaturation: 98,
  pulse: 80,
  appetite: 'good',
  mobility: 'independent',
};

function numberFromText(text: string): number | undefined {
  const match = text.match(/\b(10|[1-9])\b/);
  return match ? Number(match[1]) : undefined;
}

function parseMedicationAdherence(text: string): number {
  const normalized = text.toLowerCase();
  if (normalized.includes('no') || normalized.includes('missed')) {
    return 0.2;
  }
  if (normalized.includes('part') || normalized.includes('some')) {
    return 0.6;
  }
  return 1;
}

function parseVitals(text: string, current: CheckInDraft): Pick<CheckInDraft, 'temperatureC' | 'oxygenSaturation' | 'pulse'> {
  const normalized = text.toLowerCase();
  if (normalized.includes('skip') || normalized.includes('dont know') || normalized.includes("don't know")) {
    return {
      temperatureC: current.temperatureC,
      oxygenSaturation: current.oxygenSaturation,
      pulse: current.pulse,
    };
  }

  const values = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  let temperatureC = current.temperatureC;
  let oxygenSaturation = current.oxygenSaturation;
  let pulse = current.pulse;

  for (const value of values) {
    if (value >= 34 && value <= 43 && temperatureC === current.temperatureC) {
      temperatureC = value;
      continue;
    }
    if (value >= 80 && value <= 100 && oxygenSaturation === current.oxygenSaturation) {
      oxygenSaturation = value;
      continue;
    }
    if (value >= 40 && value <= 180 && pulse === current.pulse) {
      pulse = value;
    }
  }

  return { temperatureC, oxygenSaturation, pulse };
}

function parseAppetite(text: string): 'good' | 'reduced' | 'poor' {
  const normalized = text.toLowerCase();
  if (normalized.includes('poor') || normalized.includes('bad') || normalized.includes('low')) {
    return 'poor';
  }
  if (normalized.includes('reduced') || normalized.includes('less') || normalized.includes('little')) {
    return 'reduced';
  }
  return 'good';
}

function parseMobility(text: string): 'independent' | 'limited' | 'very-limited' {
  const normalized = text.toLowerCase();
  if (normalized.includes('very limited') || normalized.includes('cannot') || normalized.includes('hardly')) {
    return 'very-limited';
  }
  if (normalized.includes('limited') || normalized.includes('support') || normalized.includes('slow')) {
    return 'limited';
  }
  return 'independent';
}

export function ContinuousVoiceCompanion({
  patientId,
  patientName,
  latestCheckInAt,
  defaultLanguage = 'en',
}: ContinuousVoiceCompanionProps) {
  const [language, setLanguage] = useState<'en' | 'hi'>(defaultLanguage);
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [statusText, setStatusText] = useState('Stand by');
  const [history, setHistory] = useState<Message[]>([]);
  const [checkInStep, setCheckInStep] = useState<CheckInStep | null>(null);
  const [draft, setDraft] = useState<CheckInDraft>(defaultDraft);
  const [voiceReply, setVoiceReply] = useState<VoiceActionState>(null);
  const [checkInReply, setCheckInReply] = useState<VoiceCheckInActionState>(null);
  const [isPending, startTransition] = useTransition();
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const isListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const manualStopRef = useRef(false);
  const greetedRef = useRef(false);
  const historyKey = useMemo(() => `misti-history-${patientId}`, [patientId]);
  const checkInDue = useMemo(() => {
    if (!latestCheckInAt) {
      return true;
    }
    return new Date(latestCheckInAt).toDateString() !== new Date().toDateString();
  }, [latestCheckInAt]);

  useEffect(() => {
    const browserWindow = window as BrowserWindow;
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    setSupported(Boolean(Recognition));

    const saved = window.localStorage.getItem(historyKey);
    if (saved) {
      setHistory(JSON.parse(saved) as Message[]);
    }
  }, [historyKey]);

  useEffect(() => {
    window.localStorage.setItem(historyKey, JSON.stringify(history.slice(-12)));
  }, [history, historyKey]);

  useEffect(() => {
    if (voiceReply?.answer) {
      pushMessage('assistant', voiceReply.answer);
      speak(voiceReply.answer);
    }
  }, [voiceReply]);

  useEffect(() => {
    if (checkInReply?.success) {
      pushMessage('assistant', checkInReply.success);
      speak(
        checkInReply.alertsCreated && checkInReply.alertsCreated > 0
          ? `${checkInReply.success} I also created ${checkInReply.alertsCreated} alert notifications for your care team.`
          : checkInReply.success,
      );
      setCheckInStep(null);
      setDraft(defaultDraft);
    }
  }, [checkInReply]);

  function pushMessage(speaker: Message['speaker'], text: string) {
    setHistory((current) => [...current, { speaker, text } satisfies Message].slice(-12));
  }

  function stopRecognition() {
    manualStopRef.current = true;
    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
    }
    isListeningRef.current = false;
  }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) {
      setStatusText(enabled ? 'Listening' : 'Stand by');
      if (enabled) {
        startRecognition();
      }
      return;
    }

    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
    }

    isSpeakingRef.current = true;
    setStatusText('Speaking');
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 1;
    utterance.onend = () => {
      isSpeakingRef.current = false;
      setStatusText(enabled ? 'Listening' : 'Stand by');
      if (enabled) {
        manualStopRef.current = false;
        startRecognition();
      }
    };
    window.speechSynthesis.speak(utterance);
  }

  function startRecognition() {
    if (!supported || isSpeakingRef.current) {
      return;
    }

    const browserWindow = window as BrowserWindow;
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onstart = () => {
        isListeningRef.current = true;
        setStatusText('Listening');
      };
      recognition.onend = () => {
        isListeningRef.current = false;
        if (enabled && !manualStopRef.current && !isSpeakingRef.current) {
          setTimeout(() => startRecognition(), 350);
        }
      };
      recognition.onerror = (event) => {
        setStatusText(`Mic issue: ${event.error}`);
        pushMessage('system', `Microphone issue: ${event.error}`);
      };
      recognition.onresult = (event) => {
        const transcripts: string[] = [];
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result.isFinal) {
            transcripts.push(result[0].transcript.trim());
          }
        }

        for (const transcript of transcripts) {
          if (transcript) {
            handleTranscript(transcript);
          }
        }
      };
      recognitionRef.current = recognition;
    }

    recognitionRef.current.lang = language === 'hi' ? 'hi-IN' : 'en-IN';

    if (!isListeningRef.current) {
      manualStopRef.current = false;
      recognitionRef.current.start();
    }
  }

  function beginVoiceMode() {
    setEnabled(true);
    pushMessage('system', 'Voice companion enabled while this page stays open.');
    const intro = checkInDue
      ? `Hello ${patientName}. I am Misti, your recovery companion. I can stay with you, answer recovery questions, and collect your daily voice check-in. You are due for a check-in today. Say start check-in whenever you are ready.`
      : `Hello ${patientName}. I am Misti, your recovery companion. I can stay with you, answer recovery questions, and collect a fresh voice check-in any time.`;
    greetedRef.current = true;
    speak(intro);
  }

  function stopVoiceMode() {
    setEnabled(false);
    setCheckInStep(null);
    manualStopRef.current = true;
    stopRecognition();
    window.speechSynthesis.cancel();
    setStatusText('Stand by');
    pushMessage('system', 'Voice companion paused.');
  }

  function askCheckInQuestion(step: CheckInStep) {
    const prompts: Record<CheckInStep, string> = {
      symptom: 'Tell me how you are feeling today and what your main symptom is.',
      severity: 'From 1 to 10, how strong is that symptom right now?',
      medication: 'Did you take your medicines as planned? Say yes, partly, or no.',
      vitals: 'Tell me your temperature, oxygen, and pulse if you know them, or say skip.',
      appetite: 'How is your appetite today? Say good, reduced, or poor.',
      mobility: 'How is your movement today? Say independent, limited, or very limited.',
      notes: 'Anything else you want me to save for your doctor or caregiver?',
    };
    pushMessage('assistant', prompts[step]);
    speak(prompts[step]);
  }

  function startCheckIn() {
    setEnabled(true);
    greetedRef.current = true;
    setDraft(defaultDraft);
    setCheckInStep('symptom');
    askCheckInQuestion('symptom');
  }

  function submitVoiceCheckIn(nextDraft: CheckInDraft) {
    const formData = new FormData();
    formData.set('symptomLabel', nextDraft.symptomLabel);
    formData.set('symptomSeverity', String(nextDraft.symptomSeverity));
    formData.set('symptomNotes', nextDraft.symptomNotes);
    formData.set('medicationAdherence', String(nextDraft.medicationAdherence));
    formData.set('temperatureC', String(nextDraft.temperatureC));
    formData.set('oxygenSaturation', String(nextDraft.oxygenSaturation));
    formData.set('pulse', String(nextDraft.pulse));
    formData.set('appetite', nextDraft.appetite);
    formData.set('mobility', nextDraft.mobility);
    setStatusText('Saving voice check-in');
    startTransition(async () => {
      const next = await submitVoiceCheckInAction(null, formData);
      setCheckInReply(next);
    });
  }

  function handleCheckInAnswer(transcript: string) {
    const normalized = transcript.toLowerCase();
    const nextDraft = { ...draft };

    switch (checkInStep) {
      case 'symptom':
        nextDraft.symptomLabel = transcript;
        nextDraft.symptomNotes = transcript;
        setDraft(nextDraft);
        setCheckInStep('severity');
        askCheckInQuestion('severity');
        return;
      case 'severity': {
        const severity = numberFromText(normalized);
        nextDraft.symptomSeverity = severity ?? nextDraft.symptomSeverity;
        setDraft(nextDraft);
        setCheckInStep('medication');
        askCheckInQuestion('medication');
        return;
      }
      case 'medication':
        nextDraft.medicationAdherence = parseMedicationAdherence(normalized);
        setDraft(nextDraft);
        setCheckInStep('vitals');
        askCheckInQuestion('vitals');
        return;
      case 'vitals':
        Object.assign(nextDraft, parseVitals(normalized, nextDraft));
        setDraft(nextDraft);
        setCheckInStep('appetite');
        askCheckInQuestion('appetite');
        return;
      case 'appetite':
        nextDraft.appetite = parseAppetite(normalized);
        setDraft(nextDraft);
        setCheckInStep('mobility');
        askCheckInQuestion('mobility');
        return;
      case 'mobility':
        nextDraft.mobility = parseMobility(normalized);
        setDraft(nextDraft);
        setCheckInStep('notes');
        askCheckInQuestion('notes');
        return;
      case 'notes':
        if (!normalized.includes('no') && !normalized.includes('nothing')) {
          nextDraft.symptomNotes = `${nextDraft.symptomNotes}. ${transcript}`.trim();
        }
        setDraft(nextDraft);
        pushMessage('assistant', 'Thank you. I am saving your voice check-in now.');
        speak('Thank you. I am saving your voice check-in now.');
        submitVoiceCheckIn(nextDraft);
        return;
      default:
        return;
    }
  }

  function handleTranscript(transcript: string) {
    pushMessage('user', transcript);
    const normalized = transcript.toLowerCase();

    if (checkInStep) {
      handleCheckInAnswer(transcript);
      return;
    }

    if (
      normalized.includes('start check') ||
      normalized.includes('daily check') ||
      normalized.includes('check up') ||
      normalized.includes('check-in')
    ) {
      startCheckIn();
      return;
    }

    if (
      normalized.includes('stop listening') ||
      normalized.includes('pause assistant') ||
      normalized.includes('go silent')
    ) {
      stopVoiceMode();
      return;
    }

    setStatusText('Thinking');
    const formData = new FormData();
    formData.set('patientId', patientId);
    formData.set('question', transcript);
    formData.set('language', language);
    startTransition(async () => {
      const next = await askVoiceAssistantAction(null, formData);
      setVoiceReply(next);
    });
  }

  useEffect(() => {
    if (!enabled || greetedRef.current) {
      return;
    }
    beginVoiceMode();
  }, [enabled]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      if (recognitionRef.current && isListeningRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return (
    <section className="panel stack">
      <div className="row">
        <div className="stack compact">
          <strong>Misti Voice Mode</strong>
          <span className="muted">
            Continuous voice companion while this page stays open. It listens, talks back, and can
            save a guided daily check-in for the patient.
          </span>
        </div>
        <span className="pill">{statusText}</span>
      </div>

      <div className="row">
        <label className="field">
          <span>Voice language</span>
          <select
            className="textField"
            value={language}
            onChange={(event) => setLanguage(event.target.value as 'en' | 'hi')}
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </label>
        <div className="voiceControls">
          <button
            type="button"
            className="actionButton"
            onClick={() => (enabled ? stopVoiceMode() : beginVoiceMode())}
            disabled={!supported}
          >
            {enabled ? 'Pause Misti' : 'Start Misti'}
          </button>
          <button
            type="button"
            className="ghostButton"
            onClick={() => startCheckIn()}
            disabled={!supported || isPending}
          >
            Start voice check-in
          </button>
        </div>
      </div>

      {!supported ? (
        <span className="errorText">
          This browser does not support live speech recognition. Open the patient page in a modern
          Chromium browser to use continuous voice mode.
        </span>
      ) : null}

      <span className="muted">
        Try saying: “start check-in”, “can I eat papaya”, “what medicine should I take”, or “how
        am I doing today”.
      </span>

      <div className="assistantHistory stack jarvisHistory">
        {history.length === 0 ? (
          <span className="muted">No voice conversation saved yet.</span>
        ) : (
          history.map((item, index) => (
            <span
              key={`${item.speaker}-${index}`}
              className={
                item.speaker === 'assistant'
                  ? 'assistantReply'
                  : item.speaker === 'system'
                    ? 'pill'
                    : 'assistantBubble'
              }
            >
              {item.text}
            </span>
          ))
        )}
      </div>
    </section>
  );
}
