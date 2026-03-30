import Link from 'next/link';
import { requireRole } from '../../lib/auth';
import { getCaregiverWorkspace } from '../../lib/platform-state';

export const dynamic = 'force-dynamic';

export default async function CaregiverPage() {
  const session = await requireRole('caregiver');
  const caregiverWorkspace = getCaregiverWorkspace(session.userId);

  return (
    <main className="shell">
      <div className="frame">
        <section className="hero stack">
          <div className="row">
            <span className="metric">Caregiver workspace</span>
            <Link href="/" className="pill">
              Back home
            </Link>
          </div>
          <h1>Caregiver Watchtower</h1>
          <p>
            The caregiver side turns patient decline into practical next actions before the doctor
            needs to step in.
          </p>
        </section>

        <section className="grid">
          <article className="panel stack">
            <strong>{caregiverWorkspace.caregiverName}</strong>
            <span className="bigNumber status-watch">
              {caregiverWorkspace.alerts.length}
            </span>
            <span className="muted">Open alerts linked to your assigned patients</span>
          </article>

          <article className="panel stack">
            <strong>Alert stream</strong>
            {caregiverWorkspace.alerts.length === 0 ? (
              <span className="muted">No alerts are open right now.</span>
            ) : (
              caregiverWorkspace.alerts.map((alert) => (
                <span key={alert.id} className="assistantReply">
                  {alert.message}
                </span>
              ))
            )}
          </article>
        </section>

        <section className="grid">
          <article className="panel stack">
            <strong>Linked patient statuses</strong>
            {caregiverWorkspace.patients.map((patient) => (
              <div key={patient.patientId} className="listRow">
                <div className="stack compact">
                  <strong>{patient.patientName}</strong>
                  <span className="muted">{patient.diagnosis}</span>
                  <span className="muted">
                    Score: {patient.latestScore?.score ?? 'N/A'} | Status:{' '}
                    {patient.latestScore?.status ?? 'stable'}
                  </span>
                </div>
                <Link href={`/patient/${patient.patientId}`} className="pill">
                  View report
                </Link>
              </div>
            ))}
          </article>
        </section>
      </div>
    </main>
  );
}
