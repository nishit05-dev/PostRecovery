'use client';

import { useActionState, useState } from 'react';
import type { SignUpActionState } from '../app/actions';
import { signUpAction } from '../app/actions';
import { ActionButton } from './action-button';

const initialState: SignUpActionState = null;

type CareTeamOption = {
  id: string;
  name: string;
  phone?: string;
};

export function SignupForm({
  doctors,
  caregivers,
}: {
  doctors: CareTeamOption[];
  caregivers: CareTeamOption[];
}) {
  const [role, setRole] = useState<'patient' | 'caregiver' | 'doctor'>('patient');
  const [state, action] = useActionState(signUpAction, initialState);

  return (
    <form action={action} className="panel stack authCard">
      <strong>Create account</strong>
      <label className="field">
        <span>Role</span>
        <select
          name="role"
          className="textField"
          value={role}
          onChange={(event) => setRole(event.target.value as 'patient' | 'caregiver' | 'doctor')}
        >
          <option value="patient">Patient</option>
          <option value="caregiver">Caregiver</option>
          <option value="doctor">Doctor</option>
        </select>
      </label>
      <label className="field">
        <span>Full name</span>
        <input name="name" className="textField" placeholder="Your full name" />
      </label>
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" className="textField" placeholder="name@example.com" />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" className="textField" placeholder="At least 8 characters" />
      </label>
      <div className="twoCol">
        <label className="field">
          <span>Phone</span>
          <input name="phone" className="textField" placeholder="+91-98..." />
        </label>
        <label className="field">
          <span>Language</span>
          <select name="language" className="textField" defaultValue="en">
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </label>
      </div>

      {role === 'patient' ? (
        <>
          <label className="field">
            <span>Diagnosis summary</span>
            <input name="diagnosisSummary" className="textField" placeholder="Appendectomy recovery" />
          </label>
          <div className="twoCol">
            <label className="field">
              <span>Discharge date</span>
              <input name="dischargeDate" type="date" className="textField" />
            </label>
            <label className="field">
              <span>Assigned doctor</span>
              <select name="doctorId" className="textField" defaultValue={doctors[0]?.id ?? ''}>
                {doctors.length === 0 ? (
                  <option value="">No doctor available yet</option>
                ) : (
                  doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name} {doctor.phone ? `(${doctor.phone})` : ''}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Optional caregiver</span>
            <select name="caregiverId" className="textField" defaultValue="">
              <option value="">No caregiver selected</option>
              {caregivers.map((caregiver) => (
                <option key={caregiver.id} value={caregiver.id}>
                  {caregiver.name} {caregiver.phone ? `(${caregiver.phone})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="checkRow">
            <input name="voiceMonitoringConsent" type="checkbox" defaultChecked />
            <span>Enable always-available assistant monitoring for recovery support</span>
          </label>
        </>
      ) : null}

      {state?.error ? <span className="errorText">{state.error}</span> : null}
      <ActionButton label="Create account" pendingLabel="Creating account..." />
    </form>
  );
}
