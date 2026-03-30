import Link from 'next/link';
import { ActionButton } from '../../components/action-button';
import { ContinuousVoiceCompanion } from '../../components/continuous-voice-companion';
import { DocumentUploadCard } from '../../components/document-upload-card';
import { VoiceAssistantCard } from '../../components/voice-assistant-card';
import { requireRole } from '../../lib/auth';
import { getPatientWorkspace } from '../../lib/platform-state';
import {
  generateDraftAction,
  submitCheckInAction,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function PatientAppPage() {
  const session = await requireRole('patient');
  const workspace = getPatientWorkspace(session.patientId);
  const pendingDraft =
    workspace.latestDraft &&
    (!workspace.latestPlan ||
      workspace.latestDraft.createdByAiAt > workspace.latestPlan.approvedAt)
      ? workspace.latestDraft
      : null;

  return (
    <main className="shell">
      <div className="frame">
        <section className="hero stack">
          <div className="row">
            <span className="metric">Patient workspace</span>
            <Link href="/" className="pill">
              Back home
            </Link>
          </div>
          <h1>Recovery Companion</h1>
          <p>
            This patient side is wired into the shared platform state: upload discharge notes,
            generate a new AI draft, complete check-ins, and ask the assistant recovery questions.
          </p>
        </section>

        <section className="grid">
          <article className="panel stack">
            <strong>{workspace.patientName}</strong>
            <span className="muted">{workspace.diagnosis}</span>
            <span className="pill">Doctor: {workspace.doctorName}</span>
            {workspace.doctorPhone ? (
              <span className="pill">Doctor contact: {workspace.doctorPhone}</span>
            ) : null}
            {workspace.caregiverNames.map((name) => (
              <span key={name} className="pill">
                Caregiver: {name}
              </span>
            ))}
          </article>

          <article className="panel stack">
            <strong>Today&apos;s recovery score</strong>
            <span className="bigNumber status-watch">
              {workspace.latestScore?.score ?? 'N/A'}/100
            </span>
            <span className="muted">
              Latest check-in:{' '}
              {workspace.latestCheckIn?.symptoms.map((symptom) => symptom.label).join(', ') ??
                'No check-in submitted yet'}
            </span>
            <span className="muted">
              Follow-up:{' '}
              {workspace.latestPlan?.followUps[0]
                ? `${workspace.latestPlan.followUps[0].department} on ${workspace.latestPlan.followUps[0].date}`
                : 'No follow-up scheduled yet'}
            </span>
          </article>
        </section>

        <section className="grid">
          <ContinuousVoiceCompanion
            patientId={workspace.patientId}
            patientName={workspace.patientName}
            latestCheckInAt={workspace.latestCheckIn?.createdAt}
          />
        </section>

        <section className="grid">
          <DocumentUploadCard />

          <VoiceAssistantCard patientId={workspace.patientId} />
        </section>

        <section className="grid">
          <article className="panel stack">
            <div className="row">
              <strong>Approved plan</strong>
              <form action={generateDraftAction}>
                <input type="hidden" name="patientId" value={workspace.patientId} />
                <ActionButton label="Generate new AI draft" pendingLabel="Drafting..." tone="ghost" />
              </form>
            </div>
            {workspace.latestPlan ? (
              <>
                <span className="muted">{workspace.latestPlan.summary}</span>
                {workspace.latestPlan.medicationPlan.map((item) => (
                  <span
                    key={`${item.name}-${item.schedule}`}
                    className="muted"
                  >
                    {item.name} {item.dosage} - {item.schedule}
                  </span>
                ))}
              </>
            ) : (
              <span className="muted">No doctor-approved plan yet.</span>
            )}
            {pendingDraft ? (
              <span className="assistantBubble">
                New draft is waiting for doctor approval before it becomes official.
              </span>
            ) : null}
          </article>

          <article className="panel stack">
            <strong>Daily checklist</strong>
            {workspace.latestPlan?.dailyChecklist.length ? (
              workspace.latestPlan.dailyChecklist.map((item) => (
                <span key={item} className="muted">
                  {item}
                </span>
              ))
            ) : (
              <span className="muted">Checklist appears after plan approval.</span>
            )}
          </article>
        </section>

        <section className="grid">
          <form action={submitCheckInAction} className="panel stack">
            <strong>Submit daily check-in</strong>
            <input type="hidden" name="patientId" value={workspace.patientId} />
            <div className="twoCol">
              <label className="field">
                <span>Symptom</span>
                <input name="symptomLabel" className="textField" defaultValue="body pain" />
              </label>
              <label className="field">
                <span>Severity (1-10)</span>
                <input name="symptomSeverity" type="number" min="1" max="10" className="textField" defaultValue="4" />
              </label>
            </div>
            <label className="field">
              <span>Notes</span>
              <input name="symptomNotes" className="textField" placeholder="How are you feeling?" />
            </label>
            <div className="threeCol">
              <label className="field">
                <span>Medication adherence (0-1)</span>
                <input name="medicationAdherence" type="number" step="0.1" min="0" max="1" className="textField" defaultValue="0.8" />
              </label>
              <label className="field">
                <span>Temperature</span>
                <input name="temperatureC" type="number" step="0.1" className="textField" defaultValue="37.2" />
              </label>
              <label className="field">
                <span>Oxygen</span>
                <input name="oxygenSaturation" type="number" className="textField" defaultValue="97" />
              </label>
            </div>
            <div className="threeCol">
              <label className="field">
                <span>Pulse</span>
                <input name="pulse" type="number" className="textField" defaultValue="86" />
              </label>
              <label className="field">
                <span>Appetite</span>
                <select name="appetite" className="textField" defaultValue="good">
                  <option value="good">Good</option>
                  <option value="reduced">Reduced</option>
                  <option value="poor">Poor</option>
                </select>
              </label>
              <label className="field">
                <span>Mobility</span>
                <select name="mobility" className="textField" defaultValue="independent">
                  <option value="independent">Independent</option>
                  <option value="limited">Limited</option>
                  <option value="very-limited">Very limited</option>
                </select>
              </label>
            </div>
            <ActionButton label="Submit check-in" pendingLabel="Scoring recovery..." />
          </form>

          <article className="panel stack">
            <strong>Recent alerts and activity</strong>
            {workspace.alerts.length === 0 ? (
              <span className="muted">No alerts yet.</span>
            ) : (
              workspace.alerts.map((alert) => (
                <span key={alert.id} className="assistantReply">
                  {alert.message}
                </span>
              ))
            )}
            <strong>Doctor recommendations</strong>
            {workspace.recommendations.length === 0 ? (
              <span className="muted">No recommendation from your doctor yet.</span>
            ) : (
              workspace.recommendations.map((recommendation) => (
                <span key={recommendation.id} className="assistantBubble">
                  {recommendation.doctorName}: {recommendation.message}
                </span>
              ))
            )}
            <strong>Audit trail</strong>
            {workspace.auditTrail.map((event) => (
              <span key={event.id} className="timelineItem">
                {event.detail || event.action}
              </span>
            ))}
          </article>
        </section>

        <section className="grid">
          <article className="panel stack">
            <strong>Uploaded documents</strong>
            {workspace.documents.map((document) => (
              <div key={document.id} className="listRow">
                <div className="stack compact">
                  <strong>{document.fileName}</strong>
                  <span className="muted">
                    {document.kind} | {document.status}
                  </span>
                </div>
                <span className="pill">{document.createdAt.slice(0, 10)}</span>
              </div>
            ))}
          </article>

          <article className="panel stack">
            <strong>Extracted clinical data</strong>
            {workspace.extracted.map((item) => (
              <div key={item.id} className="formCard stack">
                <strong>{item.diagnosisSummary}</strong>
                {item.medications.map((medication) => (
                  <span key={`${item.id}-${medication.name}-${medication.schedule}`} className="muted">
                    {medication.name} {medication.dosage} - {medication.schedule}
                  </span>
                ))}
                {item.dietRules.map((rule) => (
                  <span key={`${item.id}-${rule.item}-${rule.allowed}`} className="pill">
                    Diet: {rule.item} {rule.allowed ? 'allowed' : 'avoid'}
                  </span>
                ))}
              </div>
            ))}
          </article>
        </section>
      </div>
    </main>
  );
}
