import type { Alert, AuditEvent, CheckIn, DoctorPatientSummary, RecoveryPlan, RecoveryScore, User } from '../../../packages/shared/src/index.ts';
import type { AppStore } from './store.ts';

function getPatientUser(appStore: AppStore, patientId: string): User | undefined {
  const patient = appStore.patients.find((item) => item.id === patientId);
  return appStore.users.find((item) => item.id === patient?.userId);
}

function symptomSummary(symptoms: CheckIn['symptoms']): string {
  if (symptoms.length === 0) {
    return 'No symptoms reported';
  }
  return symptoms.map((symptom) => `${symptom.label} (${symptom.severity}/10)`).join(', ');
}

export function getCaregiverAlerts(appStore: AppStore, caregiverId: string): Alert[] {
  return appStore.alerts.filter((alert) => alert.recipientId === caregiverId);
}

export function getDoctorTopRisk(appStore: AppStore, doctorId: string): DoctorPatientSummary[] {
  const assignedPatients = appStore.patients.filter((patient) => patient.doctorId === doctorId);

  return assignedPatients
    .map((patient) => {
      const patientUser = getPatientUser(appStore, patient.id);
      const latestScore = [...appStore.scores]
        .filter((score) => score.patientId === patient.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      const latestCheckIn = [...appStore.checkIns]
        .filter((checkIn) => checkIn.patientId === patient.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      const latestPlan = appStore.recoveryPlans.find((plan) => plan.patientId === patient.id);

      return {
        patientId: patient.id,
        patientName: patientUser?.name ?? patient.id,
        diagnosisSummary: latestPlan?.summary ?? patient.diagnosisSummary,
        latestScore: latestScore?.score ?? 100,
        latestStatus: latestScore?.status ?? 'stable',
        latestCheckInAt: latestCheckIn?.createdAt,
        latestCheckInSummary: latestCheckIn
          ? symptomSummary(latestCheckIn.symptoms)
          : 'No check-ins submitted yet',
        alertReason: latestScore?.reasons[0] ?? 'No active deterioration',
        redFlags: latestPlan?.redFlags ?? [],
      } satisfies DoctorPatientSummary;
    })
    .sort((left, right) => left.latestScore - right.latestScore)
    .slice(0, 3);
}

export function getDoctorPatientReport(
  appStore: AppStore,
  doctorId: string,
  patientId: string,
): {
  patient: User | undefined;
  profile: AppStore['patients'][number];
  plan?: RecoveryPlan;
  latestCheckIn?: CheckIn;
  latestScore?: RecoveryScore;
  alerts: Alert[];
  auditEvents: AuditEvent[];
} {
  const patient = appStore.patients.find((item) => item.id === patientId);
  if (!patient) {
    throw new Error(`Patient ${patientId} not found`);
  }
  if (patient.doctorId !== doctorId) {
    throw new Error(`Doctor ${doctorId} does not have access to ${patientId}`);
  }

  const latestCheckIn = [...appStore.checkIns]
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const latestScore = [...appStore.scores]
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  return {
    patient: getPatientUser(appStore, patientId),
    profile: patient,
    plan: appStore.recoveryPlans.find((item) => item.patientId === patientId),
    latestCheckIn,
    latestScore,
    alerts: appStore.alerts.filter((item) => item.patientId === patientId),
    auditEvents: appStore.auditEvents.filter((item) => item.targetId.includes(patientId) || item.detail.includes(patientId)),
  };
}
