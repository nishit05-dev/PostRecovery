import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Language, Role } from '@post-recovery/shared';
import { authenticateAccount, createAccount, listAvailableCareTeam } from '../../api/src/account-service.ts';
import { store } from '../../api/src/store.ts';

const SESSION_COOKIE = 'recovery_radar_session';
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'recovery-radar-demo-secret';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

type DemoCredential = {
  email: string;
  password: string;
  role: Role;
  userId: string;
  displayName: string;
  patientId?: string;
};

export type SessionUser = {
  email: string;
  role: Role;
  userId: string;
  displayName: string;
  patientId?: string;
  exp: number;
};

export const demoCredentials: DemoCredential[] = [
  {
    email: 'doctor@recoveryradar.local',
    password: 'Doctor123!',
    role: 'doctor',
    userId: 'doctor-1',
    displayName: 'Dr. Meera Shah',
  },
  {
    email: 'caregiver@recoveryradar.local',
    password: 'Caregiver123!',
    role: 'caregiver',
    userId: 'caregiver-1',
    displayName: 'Aarav Patel',
  },
  {
    email: 'patient@recoveryradar.local',
    password: 'Patient123!',
    role: 'patient',
    userId: 'patient-user-1',
    displayName: 'Riya Sen',
    patientId: 'patient-1',
  },
];

export type SignupInput = {
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
};

function sign(body: string): string {
  return createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
}

function serializeSession(session: SessionUser): string {
  const body = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function parseSessionToken(token: string | undefined): SessionUser | null {
  if (!token) {
    return null;
  }

  const [body, signature] = token.split('.');
  if (!body || !signature) {
    return null;
  }

  const expectedSignature = sign(body);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionUser;
  if (session.exp < Date.now()) {
    return null;
  }
  return session;
}

export async function loginWithCredentials(email: string, password: string): Promise<SessionUser | null> {
  const account = authenticateAccount(store, email, password);
  if (!account) {
    return null;
  }

  return {
    email: account.email,
    role: account.role,
    userId: account.userId,
    displayName: account.displayName,
    patientId: account.patientId,
    exp: Date.now() + SESSION_TTL_MS,
  };
}

export async function signUpWithCredentials(input: SignupInput): Promise<SessionUser> {
  const created = createAccount(store, input);
  return {
    email: input.email.trim().toLowerCase(),
    role: input.role,
    userId: created.user.id,
    displayName: created.user.name,
    patientId: created.patientId,
    exp: Date.now() + SESSION_TTL_MS,
  };
}

export function getSignupOptions() {
  return listAvailableCareTeam(store);
}

export async function setSessionCookie(session: SessionUser): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, serializeSession(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 0,
  });
}

export async function getOptionalSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  return parseSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getOptionalSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

export async function requireRole(role: Role | Role[]): Promise<SessionUser> {
  const session = await requireSession();
  const allowedRoles = Array.isArray(role) ? role : [role];
  if (!allowedRoles.includes(session.role)) {
    redirect(getRoleHomePath(session.role));
  }
  return session;
}

export function getRoleHomePath(role: Role): string {
  if (role === 'doctor') {
    return '/doctor';
  }
  if (role === 'caregiver') {
    return '/caregiver';
  }
  return '/patient-app';
}
