import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Language, Role, User } from '../../../packages/shared/src/index.ts';
import { recordAudit } from './audit.ts';
import { createId } from './id.ts';
import { persistStore, type AppStore } from './store.ts';

function timestamp(): string {
  return new Date().toISOString();
}

function hashPassword(password: string, salt = randomBytes(8).toString('hex')): string {
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, expectedHash] = passwordHash.split(':');
  if (!salt || !expectedHash) {
    return false;
  }

  const actual = Buffer.from(scryptSync(password, salt, 32).toString('hex'));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function findUserById(appStore: AppStore, userId: string): User | undefined {
  return appStore.users.find((user) => user.id === userId);
}

function getPatientIdForUser(appStore: AppStore, userId: string): string | undefined {
  return appStore.patients.find((patient) => patient.userId === userId)?.id;
}

export function findAccountByEmail(appStore: AppStore, email: string) {
  return appStore.authAccounts.find((account) => account.email.toLowerCase() === email.toLowerCase());
}

export function createAccount(appStore: AppStore, input: {
  role: Role;
  name: string;
  email: string;
  password: string;
  language: Language;
  phone?: string;
  doctorId?: string;
  caregiverId?: string;
  diagnosisSummary?: string;
  dischargeDate?: string;
  voiceMonitoringConsent?: boolean;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Email is required.');
  }
  if (findAccountByEmail(appStore, normalizedEmail)) {
    throw new Error('An account with this email already exists.');
  }
  if (input.password.trim().length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  let patientDoctorId: string | undefined;
  if (input.role === 'patient') {
    patientDoctorId =
      input.doctorId ??
      appStore.users.find((candidate) => candidate.role === 'doctor')?.id;
    if (!patientDoctorId) {
      throw new Error('A doctor account must exist before creating a patient account.');
    }
  }

  const userId = input.role === 'patient' ? createId('patient-user') : createId(input.role);
  const user: User = {
    id: userId,
    name: input.name.trim(),
    role: input.role,
    language: input.language,
    phone: input.phone?.trim() || undefined,
  };

  if (!user.name) {
    throw new Error('Full name is required.');
  }

  appStore.users.push(user);
  appStore.authAccounts.push({
    id: createId('account'),
    userId: user.id,
    email: normalizedEmail,
    passwordHash: hashPassword(input.password),
    createdAt: timestamp(),
  });

  let patientId: string | undefined;
  if (input.role === 'patient') {
    const caregiverIds = input.caregiverId ? [input.caregiverId] : [];
    patientId = createId('patient');
    appStore.patients.push({
      id: patientId,
      userId: user.id,
      doctorId: patientDoctorId!,
      caregiverIds,
      diagnosisSummary: input.diagnosisSummary?.trim() || 'Recovery onboarding pending document upload',
      dischargeDate: input.dischargeDate || timestamp().slice(0, 10),
      voiceMonitoringConsent: input.voiceMonitoringConsent ?? true,
      preferredLanguage: input.language,
    });
    appStore.assignments.push({
      id: createId('assign'),
      doctorId: patientDoctorId!,
      patientId,
      caregiverId: caregiverIds[0],
      createdAt: timestamp(),
    });
  }

  recordAudit(
    appStore,
    user.id,
    input.role,
    'account.created',
    user.id,
    `${input.role} account created for ${normalizedEmail}`,
  );
  persistStore(appStore);

  return {
    user,
    patientId,
  };
}

export function listAvailableCareTeam(appStore: AppStore) {
  return {
    doctors: appStore.users
      .filter((user) => user.role === 'doctor')
      .map((user) => ({ id: user.id, name: user.name, phone: user.phone })),
    caregivers: appStore.users
      .filter((user) => user.role === 'caregiver')
      .map((user) => ({ id: user.id, name: user.name, phone: user.phone })),
  };
}

export function authenticateAccount(appStore: AppStore, email: string, password: string) {
  const account = findAccountByEmail(appStore, email);
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return null;
  }

  const user = findUserById(appStore, account.userId);
  if (!user) {
    return null;
  }

  return {
    email: account.email,
    role: user.role,
    userId: user.id,
    displayName: user.name,
    patientId: user.role === 'patient' ? getPatientIdForUser(appStore, user.id) : undefined,
  };
}
