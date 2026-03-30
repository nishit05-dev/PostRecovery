'use client';

import { useActionState } from 'react';
import type { UploadDocumentActionState } from '../app/actions';
import { uploadRecoveryDocumentAction } from '../app/actions';
import { ActionButton } from './action-button';

const initialState: UploadDocumentActionState = null;

export function DocumentUploadCard() {
  const [state, action] = useActionState(uploadRecoveryDocumentAction, initialState);

  return (
    <form action={action} className="panel stack">
      <strong>Upload discharge document</strong>
      <span className="muted">
        Supports pasted text, `.txt`, scanned images, and PDF discharge documents. If OCR is slow,
        paste the discharge text directly and it will process immediately.
      </span>
      <label className="field">
        <span>Document type</span>
        <select name="kind" className="textField">
          <option value="discharge-summary">Discharge summary</option>
          <option value="prescription">Prescription</option>
          <option value="diet-sheet">Diet sheet</option>
          <option value="follow-up-note">Follow-up note</option>
          <option value="activity-note">Activity note</option>
        </select>
      </label>
      <label className="field">
        <span>OCR language</span>
        <select name="ocrLanguage" className="textField" defaultValue="en+hi">
          <option value="en">English OCR</option>
          <option value="hi">Hindi OCR</option>
          <option value="en+hi">English + Hindi OCR</option>
        </select>
      </label>
      <label className="field">
        <span>Processing mode</span>
        <select name="processingMode" className="textField" defaultValue="auto">
          <option value="auto">Auto detect and extract</option>
          <option value="fast">Fast PDF/text extraction</option>
          <option value="ocr">Scanned PDF/image OCR</option>
        </select>
        <span className="muted">
          Auto mode is best for most uploads. Use OCR mode only when you know the file is a scan and fast mode only for text-based PDFs.
        </span>
      </label>
      <label className="field">
        <span>File name</span>
        <input name="fileName" className="textField" placeholder="discharge-note.pdf" />
      </label>
      <label className="field">
        <span>Paste discharge text or OCR output</span>
        <span className="muted">Leave this blank if you want the uploaded file to be used.</span>
        <textarea
          name="documentText"
          rows={8}
          className="textField"
          placeholder={[
            'Diagnosis: Post-op recovery',
            'Medication: Paracetamol 500mg | twice daily | after food',
            'Diet: papaya allowed; spicy food avoid',
            'Activity: walking allowed; lifting heavy weights avoid',
            'Follow-up: 2026-04-12 | Surgery | review',
            'Red flags: chest pain, high fever',
            'Vitals: temperature < 38C',
          ].join('\n')}
        />
      </label>
      <label className="field">
        <span>Or upload a PDF/image/text file</span>
        <input
          name="documentFile"
          type="file"
          accept=".txt,.md,text/plain,.pdf,application/pdf,image/png,image/jpeg,image/webp,image/bmp"
        />
      </label>
      {state?.error ? <span className="errorText">{state.error}</span> : null}
      {state?.success ? <span className="assistantReply">{state.success}</span> : null}
      <ActionButton label="Upload and extract" pendingLabel="Processing document..." />
    </form>
  );
}
