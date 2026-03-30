import Link from 'next/link';
import type { DoctorPatientSummary } from '@post-recovery/shared';

export function RiskCard({ patient }: { patient: DoctorPatientSummary }) {
  return (
    <Link href={`/patient/${patient.patientId}`} className="linkCard stack">
      <div className="row">
        <strong>{patient.patientName}</strong>
        <span className={`metric status-${patient.latestStatus}`}>{patient.latestStatus}</span>
      </div>
      <span className="muted">{patient.diagnosisSummary}</span>
      <div className="signalMeter">
        <span style={{ width: `${Math.max(6, patient.latestScore)}%` }} />
      </div>
      <div className="row">
        <span>Recovery score</span>
        <strong>{patient.latestScore}/100</strong>
      </div>
      <span className="muted">{patient.latestCheckInSummary}</span>
      <span className="pill">{patient.alertReason}</span>
    </Link>
  );
}
