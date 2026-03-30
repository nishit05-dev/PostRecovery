import Link from 'next/link';
import { ActionButton } from '../../components/action-button';
import { DoctorRecommendationForm } from '../../components/doctor-recommendation-form';
import { RiskCard } from '../../components/risk-card';
import { requireRole } from '../../lib/auth';
import { getDoctorWorkspace, getPlatformOverview } from '../../lib/platform-state';
import { approveDraftAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function DoctorPage() {
  const session = await requireRole('doctor');
  const doctorWorkspace = getDoctorWorkspace(session.userId);
  const overview = getPlatformOverview();

  return (
    <main className="shell">
      <div className="frame">
        <section className="hero stack">
          <div className="row">
            <span className="metric">Doctor workspace</span>
            <Link href="/" className="pill">
              Back home
            </Link>
          </div>
          <h1>Doctor Monitoring Console</h1>
          <p>
            Review the lowest recovery scores first, inspect reports, and jump into intervention
            before a patient deteriorates further.
          </p>
        </section>

        <section className="grid grid-four">
          <article className="panel stack">
            <strong>Active patients</strong>
            <span className="bigNumber">{overview.activePatients}</span>
          </article>
          <article className="panel stack">
            <strong>Red alerts</strong>
            <span className="bigNumber status-high-risk">{overview.redAlerts}</span>
          </article>
          <article className="panel stack">
            <strong>Watch alerts</strong>
            <span className="bigNumber status-watch">{overview.watchAlerts}</span>
          </article>
          <article className="panel stack">
            <strong>Approved plans</strong>
            <span className="bigNumber">{overview.approvedPlans}</span>
          </article>
        </section>

        <section className="grid">
          {doctorWorkspace.topRisk.map((patient) => (
            <RiskCard key={patient.patientId} patient={patient} />
          ))}
        </section>

        <section className="grid">
          <article className="panel stack">
            <div className="row">
              <strong>Pending AI draft approvals</strong>
              <span className="pill">{doctorWorkspace.pendingDrafts.length} waiting</span>
            </div>
            {doctorWorkspace.pendingDrafts.length === 0 ? (
              <span className="muted">No new patient draft is waiting for doctor approval.</span>
            ) : (
              doctorWorkspace.pendingDrafts.map((item) => (
                <form key={item.patientId} action={approveDraftAction} className="stack formCard">
                  <input type="hidden" name="patientId" value={item.patientId} />
                  <strong>{item.patientName}</strong>
                  <span className="muted">{item.draft?.summary}</span>
                  <ActionButton label="Approve plan" pendingLabel="Approving..." />
                </form>
              ))
            )}
          </article>

          <article className="panel stack">
            <strong>Assigned patients</strong>
            {doctorWorkspace.patients.map((patient) => (
              <div key={patient.patientId} className="formCard stack">
                <div className="listRow">
                  <div className="stack compact">
                    <Link href={`/patient/${patient.patientId}`}>
                      <strong>{patient.patientName}</strong>
                    </Link>
                    <span className="muted">
                      Score: {patient.latestScore?.score ?? 'N/A'} | Status:{' '}
                      {patient.latestScore?.status ?? 'stable'}
                    </span>
                    {patient.patientPhone ? (
                      <span className="muted">Patient contact: {patient.patientPhone}</span>
                    ) : null}
                    {patient.caregiverContacts.map((caregiver) => (
                      <span key={caregiver.id} className="muted">
                        Caregiver: {caregiver.name}
                        {caregiver.phone ? ` | ${caregiver.phone}` : ''}
                      </span>
                    ))}
                    {patient.latestRecommendation ? (
                      <span className="assistantBubble">
                        Latest recommendation: {patient.latestRecommendation.message}
                      </span>
                    ) : null}
                  </div>
                  <Link href={`/patient/${patient.patientId}`} className="pill">
                    Open report
                  </Link>
                </div>
                <DoctorRecommendationForm
                  patientId={patient.patientId}
                  patientName={patient.patientName}
                />
              </div>
            ))}
          </article>
        </section>
      </div>
    </main>
  );
}
