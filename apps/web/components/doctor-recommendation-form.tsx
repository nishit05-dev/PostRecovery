'use client';

import { useActionState } from 'react';
import type { DoctorRecommendationActionState } from '../app/actions';
import { sendDoctorRecommendationAction } from '../app/actions';
import { ActionButton } from './action-button';

const initialState: DoctorRecommendationActionState = null;

export function DoctorRecommendationForm({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const [state, action] = useActionState(sendDoctorRecommendationAction, initialState);

  return (
    <form action={action} className="stack formCard">
      <input type="hidden" name="patientId" value={patientId} />
      <strong>Recommendation for {patientName}</strong>
      <textarea
        name="message"
        rows={3}
        className="textField"
        placeholder="Advise wound review tomorrow and continue hydration."
      />
      {state?.error ? <span className="errorText">{state.error}</span> : null}
      {state?.success ? <span className="assistantReply">{state.success}</span> : null}
      <ActionButton label="Save recommendation" pendingLabel="Saving..." />
    </form>
  );
}
