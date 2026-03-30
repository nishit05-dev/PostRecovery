import Link from 'next/link';
import { requireRole } from '../../../lib/auth';
import { getAuthorizedPatientReportView } from '../../../lib/platform-state';

export const dynamic = 'force-dynamic';

export default async function PatientReportPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const session = await requireRole(['doctor', 'caregiver']);
  const { patientId } = await params;
  const report = getAuthorizedPatientReportView({
    role: session.role === 'doctor' ? 'doctor' : 'caregiver',
    userId: session.userId,
    patientId,
  });
  const backHref = session.role === 'doctor' ? '/doctor' : '/caregiver';
  const backLabel = session.role === 'doctor' ? 'Back to doctor workspace' : 'Back to caregiver workspace';

  return (
    <main className="shell">
      <div className="frame">
        <section className="hero stack">
          <div className="row">
            <Link href={backHref} className="pill">
              {backLabel}
            </Link>
            <Link href="/" className="pill">
              Home
            </Link>
          </div>
          <h1>{report.patient?.name ?? patientId}</h1>
          <p>{report.plan?.summary ?? report.profile.diagnosisSummary}</p>
        </section>

        <section className="grid">
          <article className="panel stack">
            <strong>Latest score</strong>
            <span className="metric">{report.latestScore?.score ?? 'N/A'}/100</span>
            <span className="muted">
              {report.latestCheckIn?.symptoms.map((symptom) => symptom.label).join(', ') ??
                'No check-in available'}
            </span>
          </article>

          <article className="panel stack">
            <strong>Red flags</strong>
            {(report.plan?.redFlags ?? []).map((flag) => (
              <span key={flag} className="pill">
                {flag}
              </span>
            ))}
          </article>

          <article className="panel stack">
            <strong>Medication plan</strong>
            {(report.plan?.medicationPlan ?? []).map((item) => (
              <span key={`${item.name}-${item.schedule}`} className="muted">
                {item.name} {item.dosage} - {item.schedule}
              </span>
            ))}
          </article>
        </section>

        <section className="grid">
          <article className="panel stack">
            <strong>Daily checklist</strong>
            {(report.plan?.dailyChecklist ?? []).map((item) => (
              <span key={item} className="muted">
                {item}
              </span>
            ))}
          </article>

          <article className="panel stack">
            <strong>Escalations sent</strong>
            {report.alerts.map((item) => (
              <span key={item.id} className="muted">
                {item.message}
              </span>
            ))}
          </article>
        </section>

        <section className="panel stack">
          <strong>Doctor recommendations</strong>
          {report.recommendations.length === 0 ? (
            <span className="muted">No doctor recommendation logged yet.</span>
          ) : (
            report.recommendations.map((item) => (
              <span key={item.id} className="assistantBubble">
                {item.message}
              </span>
            ))
          )}
        </section>

        <section className="panel stack">
          <strong>Audit trail</strong>
          {report.auditEvents.map((item) => (
            <span key={item.id} className="timelineItem">
              {item.detail || item.action}
            </span>
          ))}
        </section>
      </div>
    </main>
  );
}
