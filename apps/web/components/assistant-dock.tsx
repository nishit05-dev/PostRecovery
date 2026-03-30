'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { askAmbientAssistantAction, type AmbientAssistantState } from '../app/actions';

type PatientOption = {
  patientId: string;
  patientName: string;
};

type AssistantDockProps = {
  role: 'patient' | 'caregiver' | 'doctor';
  defaultPatientId?: string;
  patientOptions: PatientOption[];
};

type Message = {
  speaker: 'user' | 'assistant';
  text: string;
};

export function AssistantDock({
  role,
  defaultPatientId,
  patientOptions,
}: AssistantDockProps) {
  const storageKey = useMemo(() => `assistant-history-${role}-${defaultPatientId ?? 'shared'}`, [defaultPatientId, role]);
  const [open, setOpen] = useState(true);
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [selectedPatientId, setSelectedPatientId] = useState(defaultPatientId ?? patientOptions[0]?.patientId ?? '');
  const [history, setHistory] = useState<Message[]>([]);
  const [response, setResponse] = useState<AmbientAssistantState>(null);
  const [isPending, startTransition] = useTransition();
  const initialized = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      setHistory(JSON.parse(saved) as Message[]);
    }
    initialized.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!initialized.current) {
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(history.slice(-8)));
  }, [history, storageKey]);

  useEffect(() => {
    if (response?.answer) {
      setHistory((current) =>
        [...current, { speaker: 'assistant', text: response.answer } satisfies Message].slice(-8),
      );
    }
  }, [response]);

  return (
    <aside className={`assistantDock ${open ? 'assistantDockOpen' : 'assistantDockClosed'}`}>
      <button className="assistantToggle" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Minimize co-pilot' : 'Open co-pilot'}
      </button>
      {open ? (
        <div className="assistantShell stack">
          <div className="row">
            <strong>Always-on assistant</strong>
            <span className="pill">{role}</span>
          </div>
          <span className="muted">
            Ask about recovery, food, symptoms, alerts, plans, or next actions from anywhere in the app.
          </span>
          {role !== 'patient' && patientOptions.length > 0 ? (
            <label className="field">
              <span>Patient context</span>
              <select
                className="textField"
                value={selectedPatientId}
                onChange={(event) => setSelectedPatientId(event.target.value)}
              >
                {patientOptions.map((patient) => (
                  <option key={patient.patientId} value={patient.patientId}>
                    {patient.patientName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="assistantHistory stack">
            {history.length === 0 ? (
              <span className="muted">No assistant messages yet.</span>
            ) : (
              history.map((item, index) => (
                <span
                  key={`${item.speaker}-${index}`}
                  className={item.speaker === 'assistant' ? 'assistantReply' : 'assistantBubble'}
                >
                  {item.text}
                </span>
              ))
            )}
          </div>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (!question.trim()) {
                return;
              }
              const currentQuestion = question.trim();
              setHistory((current) =>
                [...current, { speaker: 'user', text: currentQuestion } satisfies Message].slice(-8),
              );
              const formData = new FormData();
              formData.set('question', currentQuestion);
              formData.set('language', language);
              if (selectedPatientId) {
                formData.set('patientId', selectedPatientId);
              }
              setQuestion('');
              startTransition(async () => {
                const next = await askAmbientAssistantAction(null, formData);
                setResponse(next);
              });
            }}
          >
            <label className="field">
              <span>Language</span>
              <select
                className="textField"
                value={language}
                onChange={(event) => setLanguage(event.target.value as 'en' | 'hi')}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </label>
            <label className="field">
              <span>Question</span>
              <textarea
                className="textField"
                rows={3}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask anything about recovery or patient status"
              />
            </label>
            <button type="submit" className="actionButton" disabled={isPending}>
              {isPending ? 'Thinking...' : 'Ask assistant'}
            </button>
          </form>
        </div>
      ) : null}
    </aside>
  );
}
