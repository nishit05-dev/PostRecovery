import type {
  Alert,
  CheckIn,
  DocumentKind,
  DoctorRecommendation,
  MedicalDocument,
  RecoveryPlan,
  RecoveryPlanDraft,
  RecoveryScore,
  VoiceSession,
} from '@post-recovery/shared';
import {
  approveRecoveryPlan,
  extractClinicalData,
  generateRecoveryPlanDraft,
  uploadDocument,
} from '../../api/src/document-service.ts';
import {
  getCaregiverAlerts,
  getDoctorPatientReport,
  getDoctorTopRisk,
} from '../../api/src/doctor-service.ts';
import { recordAudit } from '../../api/src/audit.ts';
import { createId } from '../../api/src/id.ts';
import { generateGroundedAssistantResponse } from '../../api/src/llm-service.ts';
import { submitCheckIn } from '../../api/src/monitoring-service.ts';
import { persistStore, resetStore, store } from '../../api/src/store.ts';
import { answerVoiceQuery } from '../../api/src/voice-service.ts';

const DEMO_PATIENT_ID = 'patient-1';
const DEMO_DOCTOR_ID = 'doctor-1';
const DEMO_CAREGIVER_ID = 'caregiver-1';
const DEMO_PATIENT_USER_ID = 'patient-user-1';

function getUserName(userId: string): string {
  return store.users.find((user) => user.id === userId)?.name ?? userId;
}

function getUser(userId: string) {
  return store.users.find((user) => user.id === userId);
}

function getPatient(patientId: string) {
  const patient = store.patients.find((item) => item.id === patientId);
  if (!patient) {
    throw new Error(`Patient ${patientId} not found`);
  }
  return patient;
}

function getLatestByPatient<T extends { patientId: string; createdAt: string }>(
  items: T[],
  patientId: string,
): T | undefined {
  return [...items]
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function getLatestDraft(patientId: string): RecoveryPlanDraft | undefined {
  return [...store.recoveryPlanDrafts]
    .filter((draft) => draft.patientId === patientId)
    .sort((left, right) => right.createdByAiAt.localeCompare(left.createdByAiAt))[0];
}

function getLatestPlan(patientId: string): RecoveryPlan | undefined {
  return [...store.recoveryPlans]
    .filter((plan) => plan.patientId === patientId)
    .sort((left, right) => right.approvedAt.localeCompare(left.approvedAt))[0];
}

function getLatestScore(patientId: string): RecoveryScore | undefined {
  return getLatestByPatient(store.scores, patientId);
}

function getLatestVoice(patientId: string): VoiceSession | undefined {
  return getLatestByPatient(store.voiceSessions, patientId);
}

function getLatestCheckIn(patientId: string): CheckIn | undefined {
  return getLatestByPatient(store.checkIns, patientId);
}

function seedPatientFlow(
  patientId: string,
  uploadedBy: string,
  documentText: string,
  checkIn: Omit<CheckIn, 'id' | 'createdAt'>,
): void {
  const document = uploadDocument(store, {
    patientId,
    kind: 'discharge-summary',
    fileName: `${patientId}-discharge.txt`,
    uploadedBy,
    text: documentText,
  });
  extractClinicalData(store, document.id);
  const draft = generateRecoveryPlanDraft(store, patientId);
  approveRecoveryPlan(store, draft.id, DEMO_DOCTOR_ID);
  submitCheckIn(store, checkIn);
}

let seeded = false;

export function ensureDemoData(): void {
  if (seeded || store.documents.length > 0) {
    seeded = true;
    return;
  }

  seedPatientFlow(
    'patient-1',
    DEMO_PATIENT_USER_ID,
    [
      'Diagnosis: Appendectomy recovery after laparoscopic surgery',
      'Medication: Paracetamol 500mg | twice daily | after food',
      'Medication: Amoxicillin 250mg | three times daily | finish the course',
      'Diet: papaya allowed; spicy food avoid',
      'Activity: walking allowed; lifting heavy weights avoid',
      'Follow-up: 2026-04-05 | Surgery | wound review',
      'Red flags: chest pain, heavy bleeding, fever above 38C',
      'Vitals: temperature < 38C; oxygen > 94',
    ].join('\n'),
    {
      patientId: 'patient-1',
      channel: 'manual',
      symptoms: [{ label: 'body pain', severity: 4 }],
      medicationAdherence: 0.7,
      vitals: { temperatureC: 37.6, oxygenSaturation: 96, pulse: 92 },
      appetite: 'reduced',
      mobility: 'limited',
    },
  );

  seedPatientFlow(
    'patient-2',
    'patient-user-2',
    [
      'Diagnosis: Pneumonia recovery with oxygen support',
      'Medication: Azithromycin 500mg | once daily | for 5 days',
      'Diet: rice allowed; spicy food avoid',
      'Activity: breathing exercises allowed',
      'Follow-up: 2026-04-02 | Pulmonology | oxygen review',
      'Red flags: difficulty breathing, oxygen drop, high fever',
      'Vitals: oxygen > 94; temperature < 38C',
    ].join('\n'),
    {
      patientId: 'patient-2',
      channel: 'voice',
      symptoms: [{ label: 'breathlessness', severity: 8, notes: 'difficulty breathing at night' }],
      medicationAdherence: 0.8,
      vitals: { temperatureC: 38.2, oxygenSaturation: 90, pulse: 114 },
      appetite: 'poor',
      mobility: 'very-limited',
    },
  );

  seedPatientFlow(
    'patient-3',
    'patient-user-3',
    [
      'Diagnosis: Fracture recovery after discharge',
      'Medication: Calcium 500mg | twice daily | continue for 30 days',
      'Diet: milk allowed',
      'Activity: walking with support allowed; climbing stairs avoid',
      'Follow-up: 2026-04-10 | Orthopedics | fracture review',
      'Red flags: severe pain, swelling',
      'Vitals: pulse < 110',
    ].join('\n'),
    {
      patientId: 'patient-3',
      channel: 'manual',
      symptoms: [{ label: 'leg pain', severity: 6 }],
      medicationAdherence: 0.9,
      vitals: { temperatureC: 37, oxygenSaturation: 97, pulse: 88 },
      appetite: 'good',
      mobility: 'limited',
    },
  );

  seedPatientFlow(
    'patient-4',
    'patient-user-4',
    [
      'Diagnosis: Post gallbladder surgery recovery',
      'Medication: Pantoprazole 40mg | once daily | before breakfast',
      'Diet: rice allowed; papaya allowed; oily food avoid',
      'Activity: walking allowed; lifting heavy weights avoid',
      'Follow-up: 2026-04-06 | Surgery | wound review',
      'Red flags: heavy bleeding, high fever, vomiting',
      'Vitals: temperature < 38C',
    ].join('\n'),
    {
      patientId: 'patient-4',
      channel: 'manual',
      symptoms: [{ label: 'abdominal pain', severity: 5 }],
      medicationAdherence: 0.65,
      vitals: { temperatureC: 37.9, oxygenSaturation: 95, pulse: 98 },
      appetite: 'poor',
      mobility: 'limited',
    },
  );

  seeded = true;
}

export function resetDemoData(): void {
  resetStore();
  seeded = false;
  ensureDemoData();
}

export function uploadAndExtractDocument(input: {
  patientId: string;
  kind: DocumentKind;
  fileName: string;
  text: string;
  uploadedBy: string;
}): MedicalDocument {
  ensureDemoData();
  const document = uploadDocument(store, input);
  extractClinicalData(store, document.id);
  return document;
}

export function createDraftForPatient(patientId: string): RecoveryPlanDraft {
  ensureDemoData();
  return generateRecoveryPlanDraft(store, patientId);
}

export function approveLatestDraftForPatient(patientId: string, doctorId: string): RecoveryPlan {
  ensureDemoData();
  const draft = getLatestDraft(patientId);
  if (!draft) {
    throw new Error(`No draft waiting for approval for ${patientId}`);
  }
  return approveRecoveryPlan(store, draft.id, doctorId);
}

export function submitPatientCheckIn(input: Omit<CheckIn, 'id' | 'createdAt'>) {
  ensureDemoData();
  return submitCheckIn(store, input);
}

export async function askVoiceAssistant(input: {
  patientId: string;
  question: string;
  language: 'en' | 'hi';
}) {
  ensureDemoData();
  return answerVoiceQuery(store, {
    ...input,
    channel: 'continuous-listening',
  });
}

export function getPatientWorkspace(patientId = DEMO_PATIENT_ID) {
  ensureDemoData();
  const patient = getPatient(patientId);
  const patientUser = getUser(patient.userId);
  const doctor = getUser(patient.doctorId);
  const caregivers = patient.caregiverIds
    .map((caregiverId) => getUser(caregiverId))
    .filter((caregiver) => Boolean(caregiver));
  const documents = store.documents.filter((document) => document.patientId === patientId);
  const extracted = store.extractedData.filter((item) => item.patientId === patientId);
  const latestPlan = getLatestPlan(patientId);
  const latestDraft = getLatestDraft(patientId);
  const latestScore = getLatestScore(patientId);
  const latestVoice = getLatestVoice(patientId);
  const latestCheckIn = getLatestCheckIn(patientId);
  const alerts = store.alerts.filter((alert) => alert.patientId === patientId).slice(-5).reverse();
  const recommendations = store.doctorRecommendations
    .filter((item) => item.patientId === patientId)
    .slice(-5)
    .reverse()
    .map((item) => ({
      ...item,
      doctorName: getUserName(item.doctorId),
    }));

  return {
    patientId,
    patientName: patientUser?.name ?? patientId,
    diagnosis: latestPlan?.summary ?? patient.diagnosisSummary,
    doctorName: doctor?.name ?? patient.doctorId,
    doctorPhone: doctor?.phone,
    caregiverNames: caregivers.map((caregiver) => caregiver?.name ?? 'Caregiver'),
    caregiverContacts: caregivers.map((caregiver) => ({
      id: caregiver?.id ?? `${patient.id}-caregiver`,
      name: caregiver?.name ?? 'Caregiver',
      phone: caregiver?.phone,
    })),
    documents,
    extracted,
    latestDraft,
    latestPlan,
    latestScore,
    latestVoice,
    latestCheckIn,
    alerts,
    recommendations,
    auditTrail: store.auditEvents
      .filter((event) => event.targetId.includes(patientId) || event.detail.includes(patientId))
      .slice(-8)
      .reverse(),
  };
}

export function getCaregiverWorkspace(caregiverId = DEMO_CAREGIVER_ID) {
  ensureDemoData();
  const linkedPatients = store.patients.filter((patient) => patient.caregiverIds.includes(caregiverId));
  const alerts = getCaregiverAlerts(store, caregiverId).slice(-10).reverse();

  return {
    caregiverName: getUserName(caregiverId),
    caregiverPhone: getUser(caregiverId)?.phone,
    alerts,
    patients: linkedPatients.map((patient) => ({
      patientId: patient.id,
      patientName: getUserName(patient.userId),
      patientPhone: getUser(patient.userId)?.phone,
      diagnosis: getLatestPlan(patient.id)?.summary ?? patient.diagnosisSummary,
      latestScore: getLatestScore(patient.id),
      latestCheckIn: getLatestCheckIn(patient.id),
      latestPlan: getLatestPlan(patient.id),
    })),
  };
}

export function getDoctorWorkspace(doctorId = DEMO_DOCTOR_ID) {
  ensureDemoData();
  const doctorPatients = store.patients.filter((patient) => patient.doctorId === doctorId);
  const pendingDrafts = doctorPatients
    .map((patient) => ({
      patientId: patient.id,
      patientName: getUserName(patient.userId),
      draft: getLatestDraft(patient.id),
      approvedPlan: getLatestPlan(patient.id),
    }))
    .filter(
      (item) =>
        item.draft &&
        (!item.approvedPlan ||
          item.draft.createdByAiAt > item.approvedPlan.approvedAt),
    );

  return {
    doctorName: getUserName(doctorId),
    doctorPhone: getUser(doctorId)?.phone,
    topRisk: getDoctorTopRisk(store, doctorId),
    pendingDrafts,
    patients: doctorPatients.map((patient) => ({
      patientId: patient.id,
      patientName: getUserName(patient.userId),
      patientPhone: getUser(patient.userId)?.phone,
      caregiverContacts: patient.caregiverIds.map((caregiverId) => ({
        id: caregiverId,
        name: getUserName(caregiverId),
        phone: getUser(caregiverId)?.phone,
      })),
      latestScore: getLatestScore(patient.id),
      latestPlan: getLatestPlan(patient.id),
      latestCheckIn: getLatestCheckIn(patient.id),
      latestRecommendation: store.doctorRecommendations
        .filter((item) => item.patientId === patient.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0],
    })),
  };
}

export function getPatientReportView(patientId: string, doctorId = DEMO_DOCTOR_ID) {
  ensureDemoData();
  const report = getDoctorPatientReport(store, doctorId, patientId);
  return {
    ...report,
    recommendations: store.doctorRecommendations
      .filter((item) => item.patientId === patientId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}

export function getAuthorizedPatientReportView(args: {
  role: 'caregiver' | 'doctor';
  userId: string;
  patientId: string;
}) {
  ensureDemoData();

  if (args.role === 'doctor') {
    return {
      ...getDoctorPatientReport(store, args.userId, args.patientId),
      recommendations: store.doctorRecommendations
        .filter((item) => item.patientId === args.patientId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    };
  }

  const patient = store.patients.find((item) => item.id === args.patientId);
  if (!patient) {
    throw new Error(`Patient ${args.patientId} not found`);
  }
  if (!patient.caregiverIds.includes(args.userId)) {
    throw new Error(`Caregiver ${args.userId} does not have access to ${args.patientId}`);
  }

  const latestCheckIn = [...store.checkIns]
    .filter((item) => item.patientId === args.patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const latestScore = [...store.scores]
    .filter((item) => item.patientId === args.patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  return {
    patient: store.users.find((item) => item.id === patient.userId),
    profile: patient,
    plan: store.recoveryPlans.find((item) => item.patientId === args.patientId),
    latestCheckIn,
    latestScore,
    alerts: store.alerts.filter((item) => item.patientId === args.patientId),
    recommendations: store.doctorRecommendations
      .filter((item) => item.patientId === args.patientId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    auditEvents: store.auditEvents.filter(
      (item) => item.targetId.includes(args.patientId) || item.detail.includes(args.patientId),
    ),
  };
}

export function getPlatformOverview() {
  ensureDemoData();
  const uniquePatientIds = new Set(store.documents.map((document) => document.patientId));
  const redAlerts = store.alerts.filter((alert) => alert.severity === 'red').length;
  const watchAlerts = store.alerts.filter((alert) => alert.severity === 'amber').length;

  return {
    activePatients: store.patients.length,
    approvedPlans: store.recoveryPlans.length,
    uploadedPatients: uniquePatientIds.size,
    redAlerts,
    watchAlerts,
  };
}

export function createDoctorRecommendation(input: {
  doctorId: string;
  patientId: string;
  message: string;
}): DoctorRecommendation {
  ensureDemoData();
  const patient = getPatient(input.patientId);
  if (patient.doctorId !== input.doctorId) {
    throw new Error('You can only recommend actions for your assigned patients.');
  }

  const message = input.message.trim();
  if (!message) {
    throw new Error('Recommendation message is required.');
  }

  const recommendation: DoctorRecommendation = {
    id: createId('recommendation'),
    doctorId: input.doctorId,
    patientId: input.patientId,
    message,
    createdAt: new Date().toISOString(),
  };

  store.doctorRecommendations.push(recommendation);
  recordAudit(
    store,
    input.doctorId,
    'doctor',
    'doctor.recommendation',
    recommendation.id,
    `Recommendation for ${input.patientId}: ${message}`,
  );
  persistStore(store);
  return recommendation;
}

export function getAssistantPatientOptions(args: {
  role: 'patient' | 'caregiver' | 'doctor';
  userId: string;
  patientId?: string;
}) {
  ensureDemoData();

  if (args.role === 'patient') {
    const patient = getPatient(args.patientId ?? DEMO_PATIENT_ID);
    return [
      {
        patientId: patient.id,
        patientName: getUserName(patient.userId),
      },
    ];
  }

  if (args.role === 'caregiver') {
    return store.patients
      .filter((patient) => patient.caregiverIds.includes(args.userId))
      .map((patient) => ({
        patientId: patient.id,
        patientName: getUserName(patient.userId),
      }));
  }

  return store.patients
    .filter((patient) => patient.doctorId === args.userId)
    .map((patient) => ({
      patientId: patient.id,
      patientName: getUserName(patient.userId),
    }));
}

function buildRoleAwarePatientContext(patientId: string) {
  const patient = getPatient(patientId);
  const patientUser = getUser(patient.userId);
  const latestScore = getLatestScore(patientId);
  const latestPlan = getLatestPlan(patientId);
  const latestCheckIn = getLatestCheckIn(patientId);
  const latestRecommendation = store.doctorRecommendations
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const patientAlerts = store.alerts
    .filter((alert) => alert.patientId === patientId)
    .slice(-5)
    .map((alert) => ({
      severity: alert.severity,
      message: alert.message,
      createdAt: alert.createdAt,
    }));

  return JSON.stringify(
    {
      patientId,
      patientName: patientUser?.name ?? patientId,
      diagnosis: latestPlan?.summary ?? patient.diagnosisSummary,
      latestScore: latestScore
        ? {
            score: latestScore.score,
            status: latestScore.status,
            reasons: latestScore.reasons,
          }
        : null,
      latestCheckIn: latestCheckIn
        ? {
            createdAt: latestCheckIn.createdAt,
            symptoms: latestCheckIn.symptoms,
            vitals: latestCheckIn.vitals,
            medicationAdherence: latestCheckIn.medicationAdherence,
            notes: latestCheckIn.notes,
          }
        : null,
      latestPlan: latestPlan
        ? {
            summary: latestPlan.summary,
            medicationPlan: latestPlan.medicationPlan,
            redFlags: latestPlan.redFlags,
            followUps: latestPlan.followUps,
            dailyChecklist: latestPlan.dailyChecklist,
          }
        : null,
      latestDoctorRecommendation: latestRecommendation?.message ?? null,
      recentAlerts: patientAlerts,
    },
    null,
    2,
  );
}

export async function askRoleAwareAssistant(args: {
  role: 'patient' | 'caregiver' | 'doctor';
  userId: string;
  patientId?: string;
  question: string;
  language: 'en' | 'hi';
}) {
  ensureDemoData();

  const availablePatients = getAssistantPatientOptions(args);
  const activePatientId =
    args.role === 'patient'
      ? args.patientId ?? DEMO_PATIENT_ID
      : args.patientId ?? availablePatients[0]?.patientId;

  if (!activePatientId) {
    return {
      answer: 'No patient is assigned to this workspace yet.',
      confidence: 0.3,
      escalate: false,
      followUpQuestions: [],
      grounding: ['assigned patient list'],
    };
  }

  const patientName = getUserName(getPatient(activePatientId).userId);
  const normalizedQuestion = args.question.toLowerCase();

  if (
    args.role === 'patient' ||
    normalizedQuestion.includes('eat') ||
    normalizedQuestion.includes('pain') ||
    normalizedQuestion.includes('diet') ||
    normalizedQuestion.includes('symptom')
  ) {
    return (await answerVoiceQuery(store, {
      patientId: activePatientId,
      question: args.question,
      language: args.language,
      channel: 'continuous-listening',
    })).response;
  }

  const latestScore = getLatestScore(activePatientId);
  const latestPlan = getLatestPlan(activePatientId);
  const latestCheckIn = getLatestCheckIn(activePatientId);
  const latestRecommendation = store.doctorRecommendations
    .filter((item) => item.patientId === activePatientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const patientAlerts = store.alerts
    .filter((alert) => alert.patientId === activePatientId)
    .slice(-3)
    .map((alert) => alert.message);

  const modelResponse = await generateGroundedAssistantResponse({
    audience: args.role,
    language: args.language,
    patientName,
    question: args.question,
    context: buildRoleAwarePatientContext(activePatientId),
  });

  if (modelResponse) {
    return modelResponse;
  }

  return {
    answer: `${patientName} is currently ${latestScore?.status ?? 'stable'} with a recovery score of ${latestScore?.score ?? 'N/A'}. Latest check-in: ${latestCheckIn?.symptoms.map((symptom) => symptom.label).join(', ') ?? 'none yet'}. Key red flags: ${latestPlan?.redFlags.join(', ') ?? 'none listed'}. ${latestRecommendation ? `Latest doctor recommendation: ${latestRecommendation.message}.` : 'No doctor recommendation is logged yet.'}`,
    confidence: 0.82,
    escalate: latestScore?.status === 'high-risk',
    followUpQuestions:
      args.role === 'doctor'
        ? ['Do you want the latest plan summary?', 'Do you want the recent alert reasons?']
        : ['Would you like the medication summary?', 'Do you want the latest alert details?'],
    grounding:
      patientAlerts.length > 0
        ? ['fallback clinical summary', ...patientAlerts]
        : ['fallback clinical summary', 'patient score', 'approved plan', 'latest check-in'],
  };
}

export const demoIds = {
  patientId: DEMO_PATIENT_ID,
  doctorId: DEMO_DOCTOR_ID,
  caregiverId: DEMO_CAREGIVER_ID,
};
