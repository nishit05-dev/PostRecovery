'use client';

import { useState, useTransition } from 'react';
import type { VoiceActionState } from '../app/actions';
import { askVoiceAssistantAction } from '../app/actions';

export function VoiceAssistantCard({ patientId }: { patientId: string }) {
  const [state, setState] = useState<VoiceActionState>(null);
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [isPending, startTransition] = useTransition();

  return (
    <div className="panel stack">
      <strong>Voice assistant</strong>
      <span className="muted">
        Ask about food, pain, recovery doubts, or your next steps. The assistant answers only from
        approved plan data and curated recovery rules.
      </span>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!question.trim()) {
            setState({
              answer: 'Please enter a question for the assistant.',
              confidence: 0,
              escalate: false,
              grounding: [],
              followUpQuestions: [],
            });
            return;
          }

          const formData = new FormData();
          formData.set('patientId', patientId);
          formData.set('question', question.trim());
          formData.set('language', language);
          startTransition(async () => {
            const next = await askVoiceAssistantAction(null, formData);
            setState(next);
          });
        }}
      >
        <label className="field">
          <span>Question</span>
          <textarea
            rows={4}
            placeholder="Can I eat papaya? or I am feeling little pain in my body"
            className="textField"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
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
        <button type="submit" className="actionButton" disabled={isPending}>
          {isPending ? 'Checking guidance...' : 'Ask assistant'}
        </button>
      </form>
      {state ? (
        <div className="stack">
          <span className="assistantReply">{state.answer}</span>
          <span className="pill">Confidence: {(state.confidence * 100).toFixed(0)}%</span>
          {state.escalate ? <span className="pill dangerPill">Escalation suggested</span> : null}
          {state.grounding.map((item) => (
            <span key={item} className="muted">
              Grounded in: {item}
            </span>
          ))}
          {state.followUpQuestions.map((question) => (
            <span key={question} className="assistantBubble">
              {question}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
