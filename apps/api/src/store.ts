import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { createId } from './id.ts';
import type {
  Alert,
  AuthAccount,
  AuditEvent,
  CareTeamAssignment,
  CheckIn,
  DoctorRecommendation,
  DoctorPatientSummary,
  ExtractedClinicalData,
  MedicalDocument,
  PatientProfile,
  RecoveryPlan,
  RecoveryPlanDraft,
  RecoveryScore,
  User,
  VoiceSession,
} from '../../../packages/shared/src/index.ts';

export interface AppStore {
  users: User[];
  authAccounts: AuthAccount[];
  patients: PatientProfile[];
  assignments: CareTeamAssignment[];
  documents: MedicalDocument[];
  extractedData: ExtractedClinicalData[];
  recoveryPlanDrafts: RecoveryPlanDraft[];
  recoveryPlans: RecoveryPlan[];
  checkIns: CheckIn[];
  scores: RecoveryScore[];
  alerts: Alert[];
  voiceSessions: VoiceSession[];
  doctorRecommendations: DoctorRecommendation[];
  doctorSummaries: DoctorPatientSummary[];
  auditEvents: AuditEvent[];
}

const persistenceEnabled = process.env.DISABLE_STORE_PERSISTENCE !== '1';
const storeDirectory = process.env.APP_DATA_DIR?.trim()
  ? path.resolve(process.env.APP_DATA_DIR.trim())
  : path.join(process.cwd(), 'data');
export const STORE_FILE_PATH = path.join(storeDirectory, 'app-store.json');

function now(): string {
  return new Date().toISOString();
}

function hashPassword(password: string): string {
  const salt = randomBytes(8).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function createAppStore(): AppStore {
  const doctor: User = {
    id: 'doctor-1',
    name: 'Dr. Meera Shah',
    role: 'doctor',
    language: 'en',
    phone: '+91-900000001',
  };

  const caregiver: User = {
    id: 'caregiver-1',
    name: 'Aarav Patel',
    role: 'caregiver',
    language: 'en',
    phone: '+91-900000002',
  };

  const patientUsers: User[] = [
    {
      id: 'patient-user-1',
      name: 'Riya Sen',
      role: 'patient',
      language: 'en',
      phone: '+91-900000101',
    },
    {
      id: 'patient-user-2',
      name: 'Kunal Das',
      role: 'patient',
      language: 'hi',
      phone: '+91-900000102',
    },
    {
      id: 'patient-user-3',
      name: 'Fatima Noor',
      role: 'patient',
      language: 'en',
      phone: '+91-900000103',
    },
    {
      id: 'patient-user-4',
      name: 'Sanjay Kapoor',
      role: 'patient',
      language: 'hi',
      phone: '+91-900000104',
    },
  ];

  const patients: PatientProfile[] = [
    {
      id: 'patient-1',
      userId: 'patient-user-1',
      doctorId: doctor.id,
      caregiverIds: [caregiver.id],
      diagnosisSummary: 'Post appendectomy recovery',
      dischargeDate: '2026-03-27',
      voiceMonitoringConsent: true,
      preferredLanguage: 'en',
    },
    {
      id: 'patient-2',
      userId: 'patient-user-2',
      doctorId: doctor.id,
      caregiverIds: [caregiver.id],
      diagnosisSummary: 'Post pneumonia recovery',
      dischargeDate: '2026-03-26',
      voiceMonitoringConsent: true,
      preferredLanguage: 'hi',
    },
    {
      id: 'patient-3',
      userId: 'patient-user-3',
      doctorId: doctor.id,
      caregiverIds: [caregiver.id],
      diagnosisSummary: 'Fracture recovery after discharge',
      dischargeDate: '2026-03-25',
      voiceMonitoringConsent: false,
      preferredLanguage: 'en',
    },
    {
      id: 'patient-4',
      userId: 'patient-user-4',
      doctorId: doctor.id,
      caregiverIds: [caregiver.id],
      diagnosisSummary: 'Post gallbladder surgery recovery',
      dischargeDate: '2026-03-24',
      voiceMonitoringConsent: true,
      preferredLanguage: 'hi',
    },
  ];

  const assignments: CareTeamAssignment[] = patients.map((patient) => ({
    id: createId('assign'),
    doctorId: doctor.id,
    patientId: patient.id,
    caregiverId: caregiver.id,
    createdAt: now(),
  }));

  const authAccounts: AuthAccount[] = [
    {
      id: createId('account'),
      userId: doctor.id,
      email: 'doctor@recoveryradar.local',
      passwordHash: hashPassword('Doctor123!'),
      createdAt: now(),
    },
    {
      id: createId('account'),
      userId: caregiver.id,
      email: 'caregiver@recoveryradar.local',
      passwordHash: hashPassword('Caregiver123!'),
      createdAt: now(),
    },
    {
      id: createId('account'),
      userId: patientUsers[0].id,
      email: 'patient@recoveryradar.local',
      passwordHash: hashPassword('Patient123!'),
      createdAt: now(),
    },
  ];

  return {
    users: [doctor, caregiver, ...patientUsers],
    authAccounts,
    patients,
    assignments,
    documents: [],
    extractedData: [],
    recoveryPlanDrafts: [],
    recoveryPlans: [],
    checkIns: [],
    scores: [],
    alerts: [],
    voiceSessions: [],
    doctorRecommendations: [],
    doctorSummaries: [],
    auditEvents: [],
  };
}

function normalizeStore(raw: Partial<AppStore> | undefined): AppStore {
  const base = createAppStore();
  if (!raw) {
    return base;
  }

  return {
    users: raw.users ?? base.users,
    authAccounts: raw.authAccounts ?? base.authAccounts,
    patients: raw.patients ?? base.patients,
    assignments: raw.assignments ?? base.assignments,
    documents: raw.documents ?? [],
    extractedData: raw.extractedData ?? [],
    recoveryPlanDrafts: raw.recoveryPlanDrafts ?? [],
    recoveryPlans: raw.recoveryPlans ?? [],
    checkIns: raw.checkIns ?? [],
    scores: raw.scores ?? [],
    alerts: raw.alerts ?? [],
    voiceSessions: raw.voiceSessions ?? [],
    doctorRecommendations: raw.doctorRecommendations ?? [],
    doctorSummaries: raw.doctorSummaries ?? [],
    auditEvents: raw.auditEvents ?? [],
  };
}

function loadStoreFromDisk(): AppStore {
  if (!persistenceEnabled || !fs.existsSync(STORE_FILE_PATH)) {
    return createAppStore();
  }

  const raw = fs.readFileSync(STORE_FILE_PATH, 'utf8');
  return normalizeStore(JSON.parse(raw) as Partial<AppStore>);
}

export function persistStore(appStore: AppStore = store): void {
  if (!persistenceEnabled) {
    return;
  }

  fs.mkdirSync(path.dirname(STORE_FILE_PATH), { recursive: true });
  fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(appStore, null, 2), 'utf8');
}

export const store = loadStoreFromDisk();

export function resetStore(): AppStore {
  const fresh = createAppStore();
  store.users = fresh.users;
  store.authAccounts = fresh.authAccounts;
  store.patients = fresh.patients;
  store.assignments = fresh.assignments;
  store.documents = fresh.documents;
  store.extractedData = fresh.extractedData;
  store.recoveryPlanDrafts = fresh.recoveryPlanDrafts;
  store.recoveryPlans = fresh.recoveryPlans;
  store.checkIns = fresh.checkIns;
  store.scores = fresh.scores;
  store.alerts = fresh.alerts;
  store.voiceSessions = fresh.voiceSessions;
  store.doctorRecommendations = fresh.doctorRecommendations;
  store.doctorSummaries = fresh.doctorSummaries;
  store.auditEvents = fresh.auditEvents;
  persistStore(store);
  return store;
}
