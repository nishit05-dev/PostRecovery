'use client';

import { useActionState } from 'react';
import type { LoginActionState } from '../app/actions';
import { loginAction } from '../app/actions';
import { ActionButton } from './action-button';

const initialState: LoginActionState = null;

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="panel stack authCard">
      <strong>Sign in</strong>
      <label className="field">
        <span>Email</span>
        <input name="email" className="textField" placeholder="doctor@recoveryradar.local" />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" className="textField" placeholder="Password" />
      </label>
      {state?.error ? <span className="errorText">{state.error}</span> : null}
      <ActionButton label="Sign in" pendingLabel="Signing in..." />
    </form>
  );
}

