'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  approveLatestDraftForPatient,
  askRoleAwareAssistant,
  createDraftForPatient,
  getAssistantPatientOptions,
  resetDemoData,
  submitPatientCheckIn,
  uploadAndExtractDocument,
} from '../lib/platform-state';
import { extractTextFromUpload } from '../lib/ocr';
import {
  clearSessionCookie,
  getRoleHomePath,
  loginWithCredentials,
  requireRole,
  requireSession,
  setSessionCookie,
  signUpWithCredentials,
  type SessionUser,
} from '../lib/auth';

function asString(value: FormDataEntryValue | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: FormDataEntryValue | null, fallback: number): number {
  const raw = typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(raw) ? raw : fallback;
}

function revalidateAll(): void {
  revalidatePath('/');
  revalidatePath('/patient-app');
  revalidatePath('/caregiver');
  revalidatePath('/doctor');
  revalidatePath('/patient/patient-1');
  revalidatePath('/patient/patient-2');
  revalidatePath('/patient/patient-3');
  revalidatePath('/patient/patient-4');
  revalidatePath('/login');
}

export async function resetDemoAction() {
  await requireSession();
  resetDemoData();
  revalidateAll();
}

function patientSessionOrThrow(session: SessionUser): string {
  if (session.role !== 'patient' || !session.patientId) {
    throw new Error('Only patient users can perform this action.');
  }
  return session.patientId;
}

export type LoginActionState = {
  error: string | null;
} | null;

export type SignUpActionState = {
  error: string | null;
} | null;

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = asString(formData.get('email')).trim();
  const password = asString(formData.get('password'));
  const session = await loginWithCredentials(email, password);

  if (!session) {
    return { error: 'Invalid email or password.' };
  }

  await setSessionCookie(session);
  redirect(getRoleHomePath(session.role));
}

export async function signUpAction(
  _previousState: SignUpActionState,
  formData: FormData,
): Promise<SignUpActionState> {
  try {
    const session = await signUpWithCredentials({
      role: asString(formData.get('role'), 'patient') as 'patient' | 'caregiver' | 'doctor',
      name: asString(formData.get('name')).trim(),
      email: asString(formData.get('email')).trim(),
      password: asString(formData.get('password')),
      language: asString(formData.get('language'), 'en') as 'en' | 'hi',
      phone: asString(formData.get('phone')).trim(),
      doctorId: asString(formData.get('doctorId')).trim() || undefined,
      caregiverId: asString(formData.get('caregiverId')).trim() || undefined,
      diagnosisSummary: asString(formData.get('diagnosisSummary')).trim() || undefined,
      dischargeDate: asString(formData.get('dischargeDate')).trim() || undefined,
      voiceMonitoringConsent: asString(formData.get('voiceMonitoringConsent')) === 'on',
    });

    await setSessionCookie(session);
    revalidateAll();
    redirect(getRoleHomePath(session.role));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to create account.',
    };
  }
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect('/login');
}

export type UploadDocumentActionState = {
  error: string | null;
  success: string | null;
} | null;

export async function uploadRecoveryDocumentAction(
  _previousState: UploadDocumentActionState,
  formData: FormData,
): Promise<UploadDocumentActionState> {
  try {
    const session = await requireRole('patient');
    const uploadedFile = formData.get('documentFile');
    const ocrLanguage = asString(formData.get('ocrLanguage'), 'en') as 'en' | 'hi' | 'en+hi';
    const processingMode = asString(formData.get('processingMode'), 'auto') as 'auto' | 'fast' | 'ocr';
    const kind = asString(formData.get('kind'), 'discharge-summary') as
      | 'discharge-summary'
      | 'prescription'
      | 'follow-up-note'
      | 'diet-sheet'
      | 'activity-note'
      | 'other';
    const textArea = asString(formData.get('documentText')).trim();
    let fileName = asString(formData.get('fileName')).trim();

    if (uploadedFile instanceof File && uploadedFile.size > 0 && !fileName) {
      fileName = uploadedFile.name;
    }

    const { text, source } = await extractTextFromUpload({
      file: uploadedFile instanceof File ? uploadedFile : null,
      manualText: textArea,
      fileName,
      ocrLanguage,
      processingMode,
    });

    uploadAndExtractDocument({
      patientId: patientSessionOrThrow(session),
      kind,
      fileName: fileName || `${kind}.txt`,
      text,
      uploadedBy: session.userId,
    });
    createDraftForPatient(patientSessionOrThrow(session));
    revalidateAll();

    return {
      error: null,
      success: `Document processed from ${source} and a new draft plan was generated for doctor review.`,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Document upload failed.',
      success: null,
    };
  }
}

export async function generateDraftAction(formData: FormData) {
  const session = await requireRole('patient');
  createDraftForPatient(patientSessionOrThrow(session));
  revalidateAll();
}

export async function approveDraftAction(formData: FormData) {
  const session = await requireRole('doctor');
  const patientId = asString(formData.get('patientId'));
  if (!patientId) {
    throw new Error('Missing patient id for approval.');
  }
  approveLatestDraftForPatient(patientId, session.userId);
  revalidateAll();
}

export async function submitCheckInAction(formData: FormData) {
  const session = await requireRole('patient');
  submitPatientCheckIn({
    patientId: patientSessionOrThrow(session),
    channel: 'manual',
    symptoms: [
      {
        label: asString(formData.get('symptomLabel'), 'general discomfort'),
        severity: asNumber(formData.get('symptomSeverity'), 3),
        notes: asString(formData.get('symptomNotes')),
      },
    ],
    medicationAdherence: asNumber(formData.get('medicationAdherence'), 0.9),
    vitals: {
      temperatureC: asNumber(formData.get('temperatureC'), 36.8),
      oxygenSaturation: asNumber(formData.get('oxygenSaturation'), 98),
      pulse: asNumber(formData.get('pulse'), 80),
    },
    appetite: asString(formData.get('appetite'), 'good') as 'good' | 'reduced' | 'poor',
    mobility: asString(formData.get('mobility'), 'independent') as
      | 'independent'
      | 'limited'
      | 'very-limited',
  });
  revalidateAll();
}

export type VoiceCheckInActionState = {
  error: string | null;
  success: string | null;
  score?: number;
  status?: string;
  alertsCreated?: number;
} | null;

export async function submitVoiceCheckInAction(
  _previousState: VoiceCheckInActionState,
  formData: FormData,
): Promise<VoiceCheckInActionState> {
  try {
    const session = await requireRole('patient');
    const result = submitPatientCheckIn({
      patientId: patientSessionOrThrow(session),
      channel: 'voice',
      symptoms: [
        {
          label: asString(formData.get('symptomLabel'), 'general discomfort'),
          severity: asNumber(formData.get('symptomSeverity'), 3),
          notes: asString(formData.get('symptomNotes')),
        },
      ],
      medicationAdherence: asNumber(formData.get('medicationAdherence'), 0.9),
      vitals: {
        temperatureC: asNumber(formData.get('temperatureC'), 36.8),
        oxygenSaturation: asNumber(formData.get('oxygenSaturation'), 98),
        pulse: asNumber(formData.get('pulse'), 80),
      },
      appetite: asString(formData.get('appetite'), 'good') as 'good' | 'reduced' | 'poor',
      mobility: asString(formData.get('mobility'), 'independent') as
        | 'independent'
        | 'limited'
        | 'very-limited',
      notes: asString(formData.get('symptomNotes')),
    });

    revalidateAll();

    return {
      error: null,
      success: `Voice check-in saved. Recovery score is ${result.score.score} and status is ${result.score.status}.`,
      score: result.score.score,
      status: result.score.status,
      alertsCreated: result.alerts.length,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to save voice check-in.',
      success: null,
    };
  }
}

export type VoiceActionState = {
  answer: string;
  confidence: number;
  escalate: boolean;
  grounding: string[];
  followUpQuestions: string[];
} | null;

export async function askVoiceAssistantAction(
  _previousState: VoiceActionState,
  formData: FormData,
): Promise<VoiceActionState> {
  try {
    const session = await requireRole('patient');
    const question = asString(formData.get('question')).trim();
    if (!question) {
      return {
        answer: 'Please enter a question for the assistant.',
        confidence: 0,
        escalate: false,
        grounding: [],
        followUpQuestions: [],
      };
    }

    const result = await askRoleAwareAssistant({
      role: session.role,
      userId: session.userId,
      patientId: patientSessionOrThrow(session),
      question,
      language: asString(formData.get('language'), 'en') as 'en' | 'hi',
    });

    revalidateAll();

    return {
      answer: result.answer,
      confidence: result.confidence,
      escalate: result.escalate,
      grounding: result.grounding,
      followUpQuestions: result.followUpQuestions,
    };
  } catch (error) {
    return {
      answer: error instanceof Error ? error.message : 'Assistant could not answer right now.',
      confidence: 0,
      escalate: true,
      grounding: ['assistant error'],
      followUpQuestions: [],
    };
  }
}

export type AmbientAssistantState = {
  answer: string;
  confidence: number;
  escalate: boolean;
  grounding: string[];
  followUpQuestions: string[];
} | null;

export async function askAmbientAssistantAction(
  _previousState: AmbientAssistantState,
  formData: FormData,
): Promise<AmbientAssistantState> {
  try {
    const session = await requireSession();
    const question = asString(formData.get('question')).trim();
    const selectedPatientId = asString(formData.get('patientId')).trim() || undefined;

    if (!question) {
      return {
        answer: 'Ask the assistant anything about recovery, alerts, plans, food, or symptoms.',
        confidence: 0,
        escalate: false,
        grounding: [],
        followUpQuestions: [],
      };
    }

    const options = getAssistantPatientOptions({
      role: session.role,
      userId: session.userId,
      patientId: session.patientId,
    });

    const result = await askRoleAwareAssistant({
      role: session.role,
      userId: session.userId,
      patientId: selectedPatientId ?? options[0]?.patientId ?? session.patientId,
      question,
      language: asString(formData.get('language'), 'en') as 'en' | 'hi',
    });

    revalidateAll();

    return {
      answer: result.answer,
      confidence: result.confidence,
      escalate: result.escalate,
      grounding: result.grounding,
      followUpQuestions: result.followUpQuestions,
    };
  } catch (error) {
    return {
      answer: error instanceof Error ? error.message : 'Assistant could not answer right now.',
      confidence: 0,
      escalate: true,
      grounding: ['assistant error'],
      followUpQuestions: [],
    };
  }
}

export type DoctorRecommendationActionState = {
  error: string | null;
  success: string | null;
} | null;

export async function sendDoctorRecommendationAction(
  _previousState: DoctorRecommendationActionState,
  formData: FormData,
): Promise<DoctorRecommendationActionState> {
  try {
    const session = await requireRole('doctor');
    const patientId = asString(formData.get('patientId')).trim();
    const message = asString(formData.get('message')).trim();
    if (!patientId || !message) {
      throw new Error('Select a patient and enter a recommendation.');
    }

    const { createDoctorRecommendation } = await import('../lib/platform-state');
    createDoctorRecommendation({
      doctorId: session.userId,
      patientId,
      message,
    });
    revalidateAll();

    return {
      error: null,
      success: 'Recommendation saved to the patient record.',
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to save recommendation.',
      success: null,
    };
  }
}
