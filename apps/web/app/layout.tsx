import './globals.css';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AssistantDock } from '../components/assistant-dock';
import { logoutAction } from './actions';
import { getOptionalSession } from '../lib/auth';
import { getAssistantPatientOptions } from '../lib/platform-state';

export const metadata = {
  title: 'Recovery Radar',
  description: 'Doctor dashboard for AI-guided post-discharge monitoring',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getOptionalSession();
  const patientOptions = session
    ? getAssistantPatientOptions({
        role: session.role,
        userId: session.userId,
        patientId: session.patientId,
      })
    : [];

  return (
    <html lang="en">
      <body>
        {session ? (
          <header className="appHeader">
            <div className="appHeaderInner">
              <Link href="/" className="brandLockup">
                <span className="brandMark">Recovery Radar</span>
                <span className="brandSub">Post-discharge command center</span>
              </Link>
              <div className="row">
                <span className="pill">{session.role}</span>
                <span className="muted">{session.displayName}</span>
                <form action={logoutAction}>
                  <button type="submit" className="ghostButton">
                    Log out
                  </button>
                </form>
              </div>
            </div>
          </header>
        ) : null}
        {children}
        {session ? (
          <AssistantDock
            role={session.role}
            defaultPatientId={session.patientId}
            patientOptions={patientOptions}
          />
        ) : null}
      </body>
    </html>
  );
}
