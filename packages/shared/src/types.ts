export type Role = 'patient' | 'caregiver' | 'doctor';
export type Language = 'en' | 'hi';
export type DocumentKind =
  | 'discharge-summary'
  | 'prescription'
  | 'follow-up-note'
  | 'diet-sheet'
  | 'activity-note'
  | 'other';
export type DocumentStatus = 'uploaded' | 'extracted';
export type AlertSeverity = 'amber' | 'red';
export type AlertStatus = 'open' | 'acknowledged';
export type RecoveryRiskStatus = 'stable' | 'watch' | 'high-risk';
export type VoiceChannel = 'continuous-listening' | 'push-to-talk';
export type CheckInChannel = 'voice' | 'manual';

export interface User {
  id: string;
  name: string;
  role: Role;
  language: Language;
  phone?: string;
}

export interface AuthAccount {
  id: string;
  userId: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface CareTeamAssignment {
  id: string;
  doctorId: string;
  patientId: string;
  caregiverId?: string;
  createdAt: string;
}

export interface PatientProfile {
  id: string;
  userId: string;
  doctorId: string;
  caregiverIds: string[];
  diagnosisSummary: string;
  dischargeDate: string;
  voiceMonitoringConsent: boolean;
  preferredLanguage: Language;
}

export interface MedicationInstruction {
  name: string;
  dosage: string;
  schedule: string;
  notes?: string;
}

export interface DietRule {
  item: string;
  allowed: boolean;
  reason: string;
}

export interface ActivityRule {
  action: string;
  allowed: boolean;
  notes: string;
}

export interface FollowUpAppointment {
  date: string;
  department: string;
  notes?: string;
}

export interface VitalsInstruction {
  metric: 'temperature' | 'blood-pressure' | 'oxygen' | 'pulse';
  target: string;
  notes?: string;
}

export interface MedicalDocument {
  id: string;
  patientId: string;
  kind: DocumentKind;
  fileName: string;
  uploadedBy: string;
  text: string;
  status: DocumentStatus;
  createdAt: string;
}

export interface ExtractedClinicalData {
  id: string;
  documentId: string;
  patientId: string;
  diagnosisSummary: string;
  medications: MedicationInstruction[];
  dietRules: DietRule[];
  activityRules: ActivityRule[];
  followUps: FollowUpAppointment[];
  redFlags: string[];
  vitalsInstructions: VitalsInstruction[];
  createdAt: string;
}

export interface RecoveryPlanDraft {
  id: string;
  patientId: string;
  sourceDocumentIds: string[];
  extractedDataIds: string[];
  summary: string;
  dailyChecklist: string[];
  medicationPlan: MedicationInstruction[];
  dietGuidance: DietRule[];
  activityGuidance: ActivityRule[];
  followUps: FollowUpAppointment[];
  redFlags: string[];
  createdByAiAt: string;
}

export interface RecoveryPlan {
  id: string;
  draftId: string;
  patientId: string;
  summary: string;
  dailyChecklist: string[];
  medicationPlan: MedicationInstruction[];
  dietGuidance: DietRule[];
  activityGuidance: ActivityRule[];
  followUps: FollowUpAppointment[];
  redFlags: string[];
  approvedAt: string;
  approvedByDoctorId: string;
}

export interface SymptomEntry {
  label: string;
  severity: number;
  notes?: string;
}

export interface VitalsEntry {
  temperatureC?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  oxygenSaturation?: number;
  pulse?: number;
}

export interface CheckIn {
  id: string;
  patientId: string;
  channel: CheckInChannel;
  createdAt: string;
  symptoms: SymptomEntry[];
  medicationAdherence: number;
  vitals: VitalsEntry;
  sleepHours?: number;
  appetite?: 'good' | 'reduced' | 'poor';
  mobility?: 'independent' | 'limited' | 'very-limited';
  woundStatus?: 'clean' | 'redness' | 'bleeding' | 'discharge';
  bowelStatus?: 'normal' | 'constipation' | 'diarrhea';
  bladderStatus?: 'normal' | 'painful' | 'difficulty';
  notes?: string;
}

export interface RecoveryScore {
  id: string;
  patientId: string;
  checkInId: string;
  score: number;
  status: RecoveryRiskStatus;
  reasons: string[];
  createdAt: string;
}

export interface Alert {
  id: string;
  patientId: string;
  checkInId?: string;
  severity: AlertSeverity;
  recipientRole: Extract<Role, 'caregiver' | 'doctor'>;
  recipientId: string;
  message: string;
  status: AlertStatus;
  createdAt: string;
}

export interface VoiceSession {
  id: string;
  patientId: string;
  language: Language;
  channel: VoiceChannel;
  transcript: string;
  reply: string;
  confidence: number;
  escalated: boolean;
  followUpQuestions: string[];
  createdAt: string;
}

export interface DoctorRecommendation {
  id: string;
  patientId: string;
  doctorId: string;
  message: string;
  createdAt: string;
}

export interface DoctorPatientSummary {
  patientId: string;
  patientName: string;
  diagnosisSummary: string;
  latestScore: number;
  latestStatus: RecoveryRiskStatus;
  latestCheckInAt?: string;
  latestCheckInSummary: string;
  alertReason: string;
  redFlags: string[];
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorRole: Role | 'system';
  action: string;
  targetId: string;
  detail: string;
  createdAt: string;
}

export interface VoiceQueryResponse {
  answer: string;
  confidence: number;
  escalate: boolean;
  followUpQuestions: string[];
  grounding: string[];
}
