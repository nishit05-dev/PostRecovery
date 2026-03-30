import Link from 'next/link';
import { ActionButton } from '../components/action-button';
import { RoleCard } from '../components/role-card';
import { requireSession } from '../lib/auth';
import {
  getPatientWorkspace,
  getPlatformOverview,
  getCaregiverWorkspace,
  getDoctorWorkspace,
} from '../lib/platform-state';
import { resetDemoAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await requireSession();
  const overview = getPlatformOverview();
  const patient = session.role === 'patient' ? getPatientWorkspace(session.patientId) : null;
  const caregiver = session.role === 'caregiver' ? getCaregiverWorkspace(session.userId) : null;
  const doctor = session.role === 'doctor' ? getDoctorWorkspace(session.userId) : null;

  return (
    <main className="shell">
      <div className="frame">
        <section className="hero stack">
          <div className="heroSplit">
            <div className="stack">
              <div className="row">
                <span className="metric">Interactive post-recovery platform</span>
                <form action={resetDemoAction}>
                  <ActionButton label="Reset demo data" pendingLabel="Resetting..." tone="ghost" />
                </form>
              </div>
              <h1>Recovery Radar</h1>
              <p>
                A live post-discharge workspace where patients talk naturally, caregivers stay in
                the loop, and doctors focus on the people who need help first.
              </p>
              <div className="heroStats">
                <div className="heroStat">
                  <strong>{overview.activePatients}</strong>
                  <span className="muted">Active patient journeys</span>
                </div>
                <div className="heroStat">
                  <strong>{overview.approvedPlans}</strong>
                  <span className="muted">Doctor-approved recovery plans</span>
                </div>
                <div className="heroStat">
                  <strong>{overview.redAlerts + overview.watchAlerts}</strong>
                  <span className="muted">Signals waiting for follow-up</span>
                </div>
              </div>
            </div>

            <div className="heroSide">
              <div className="spotlightCard stack">
                <span className="metric">Live care loop</span>
                <strong>Upload -&gt; extract -&gt; approve -&gt; monitor -&gt; intervene</strong>
                <span className="muted">
                  Each role sees the same recovery story, but with their own priorities and actions.
                </span>
              </div>
              <div className="surfaceBand">
                <div className="surfaceBandItem">
                  <strong>Patient</strong>
                  <span className="muted">Voice-first check-ins, plans, medication guidance</span>
                </div>
                <div className="surfaceBandItem">
                  <strong>Caregiver</strong>
                  <span className="muted">Alert-led support with linked patient context</span>
                </div>
                <div className="surfaceBandItem">
                  <strong>Doctor</strong>
                  <span className="muted">Top-risk prioritization and fast intervention</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-four">
          <article className="panel stack">
            <strong>Active patients</strong>
            <span className="bigNumber">{overview.activePatients}</span>
          </article>
          <article className="panel stack">
            <strong>Approved plans</strong>
            <span className="bigNumber">{overview.approvedPlans}</span>
          </article>
          <article className="panel stack">
            <strong>Red alerts</strong>
            <span className="bigNumber status-high-risk">{overview.redAlerts}</span>
          </article>
          <article className="panel stack">
            <strong>Watch alerts</strong>
            <span className="bigNumber status-watch">{overview.watchAlerts}</span>
          </article>
        </section>

        <section className="grid">
          {session.role === 'patient' ? (
            <RoleCard
              title="Patient workspace"
              href="/patient-app"
              metric="Voice-first recovery"
              description="Upload documents, run Misti mode, submit check-ins, and follow the doctor-approved plan."
            />
          ) : null}
          {session.role === 'caregiver' ? (
            <RoleCard
              title="Caregiver workspace"
              href="/caregiver"
              metric="Alert-driven support"
              description="Watch recovery drift, catch alerts early, and move from concern to action faster."
            />
          ) : null}
          {session.role === 'doctor' ? (
            <RoleCard
              title="Doctor workspace"
              href="/doctor"
              metric="Approve and intervene"
              description="Triage top-risk patients, approve new plans, and push recommendations from one command console."
            />
          ) : null}
        </section>

        <section className="grid">
          {patient ? (
            <article className="panel stack">
              <div className="row">
                <strong>Patient live snapshot</strong>
                <Link href="/patient-app" className="pill">
                  Open patient side
                </Link>
              </div>
              <span className="muted">{patient.patientName}</span>
              <span className="assistantReply">
                Current score: {patient.latestScore?.score ?? 'N/A'}/100
              </span>
              <span className="muted">
                Latest voice answer: {patient.latestVoice?.reply ?? 'No assistant question yet'}
              </span>
              <div className="signalCard stack">
                <strong>Recovery pulse</strong>
                <div className="signalMeter">
                  <span style={{ width: `${patient.latestScore?.score ?? 18}%` }} />
                </div>
                <span className="muted">
                  Misti and daily check-ins keep this signal updated for the care team.
                </span>
              </div>
            </article>
          ) : null}

          {caregiver ? (
            <article className="panel stack">
              <div className="row">
                <strong>Caregiver live snapshot</strong>
                <Link href="/caregiver" className="pill">
                  Open caregiver side
                </Link>
              </div>
              <span className="muted">{caregiver.caregiverName}</span>
              <span className="assistantReply">Open alerts: {caregiver.alerts.length}</span>
              <span className="muted">
                First linked patient: {caregiver.patients[0]?.patientName ?? 'No patient assigned'}
              </span>
              <div className="signalCard stack">
                <strong>Caregiver tempo</strong>
                <div className="signalMeter">
                  <span style={{ width: `${Math.min(100, caregiver.alerts.length * 22 + 18)}%` }} />
                </div>
                <span className="muted">
                  Alerts route here first for non-severe decline so the care loop moves quickly.
                </span>
              </div>
            </article>
          ) : null}

          {doctor ? (
            <article className="panel stack">
              <div className="row">
                <strong>Doctor live snapshot</strong>
                <Link href="/doctor" className="pill">
                  Open doctor side
                </Link>
              </div>
              <span className="muted">{doctor.doctorName}</span>
              <span className="assistantReply">
                Top-risk patient: {doctor.topRisk[0]?.patientName ?? 'None'}
              </span>
              <span className="muted">Pending plan approvals: {doctor.pendingDrafts.length}</span>
              <div className="signalCard stack">
                <strong>Intervention load</strong>
                <div className="signalMeter">
                  <span
                    style={{
                      width: `${Math.min(100, doctor.pendingDrafts.length * 24 + doctor.topRisk.length * 18 + 12)}%`,
                    }}
                  />
                </div>
                <span className="muted">
                  The dashboard surfaces the patients most likely to need a call right now.
                </span>
              </div>
            </article>
          ) : null}
        </section>
      </div>
    </main>
  );
}
