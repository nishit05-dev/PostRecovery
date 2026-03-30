import type { DoctorPatientSummary } from '@post-recovery/shared';

export const doctorDashboard: DoctorPatientSummary[] = [
  {
    patientId: 'patient-2',
    patientName: 'Kunal Das',
    diagnosisSummary: 'Post pneumonia recovery with oxygen monitoring',
    latestScore: 34,
    latestStatus: 'high-risk',
    latestCheckInAt: '2026-03-29T08:30:00.000Z',
    latestCheckInSummary: 'breathlessness (8/10), chest discomfort (7/10)',
    alertReason: 'Oxygen saturation below safe threshold.',
    redFlags: ['difficulty breathing', 'oxygen drop'],
  },
  {
    patientId: 'patient-4',
    patientName: 'Sanjay Kapoor',
    diagnosisSummary: 'Post gallbladder surgery recovery with wound checks',
    latestScore: 58,
    latestStatus: 'watch',
    latestCheckInAt: '2026-03-29T07:45:00.000Z',
    latestCheckInSummary: 'abdominal pain (5/10), low appetite (4/10)',
    alertReason: 'Missed or delayed medication doses reported.',
    redFlags: ['heavy bleeding', 'high fever'],
  },
  {
    patientId: 'patient-1',
    patientName: 'Riya Sen',
    diagnosisSummary: 'Post appendectomy recovery with diet guidance',
    latestScore: 66,
    latestStatus: 'watch',
    latestCheckInAt: '2026-03-29T06:20:00.000Z',
    latestCheckInSummary: 'body pain (4/10)',
    alertReason: 'Reduced appetite reported.',
    redFlags: ['chest pain', 'fever above 38C'],
  },
];

export const landingHighlights = [
  {
    title: 'Patient side',
    href: '/patient-app',
    metric: 'Voice-led recovery',
    description:
      'Upload discharge files, get a doctor-approved plan, ask food or symptom questions, and complete daily check-ins.',
  },
  {
    title: 'Caregiver side',
    href: '/caregiver',
    metric: 'Early alerts',
    description:
      'See medication adherence, warning symptoms, and whether the patient needs closer support today.',
  },
  {
    title: 'Doctor side',
    href: '/doctor',
    metric: 'Top-risk patients',
    description:
      'See the 3 lowest scores first, review reports, and contact the care team when recovery declines.',
  },
];

export const patientPortal = {
  patientName: 'Riya Sen',
  diagnosis: 'Appendectomy recovery after laparoscopic surgery',
  doctor: 'Dr. Meera Shah',
  caregiver: 'Aarav Patel',
  nextCheckIn: 'Today, 8:00 PM',
  nextFollowUp: '2026-04-05, Surgery review',
  meds: [
    'Paracetamol 500mg after food, twice daily',
    'Amoxicillin 250mg three times daily',
  ],
  uploadQueue: [
    'Discharge summary uploaded',
    'Prescription extracted',
    'Diet note approved by doctor',
  ],
  checklist: [
    'Take medicines on time',
    'Avoid spicy food',
    'Walk slowly for 10 minutes',
    'Complete evening voice check-in',
  ],
  voicePrompts: [
    'Can I eat papaya?',
    'I am feeling little pain in my body',
    'When is my next follow-up?',
  ],
  assistantReply:
    'Papaya is allowed in your approved recovery plan. Keep portions moderate and avoid spicy food.',
  dailyScore: 66,
};

export const caregiverWorkspace = {
  patientName: 'Riya Sen',
  latestScore: 66,
  trend: 'Down from 79 yesterday',
  symptoms: ['Body pain 4/10', 'Reduced appetite', 'No red-flag symptom reported'],
  actions: [
    'Confirm evening medication was taken',
    'Ask about food intake',
    'Review next check-in at 8:00 PM',
  ],
  alerts: [
    'Amber alert sent because medication adherence dropped to 70%',
    'Doctor is not yet notified because there is no severe red flag',
  ],
};

export const doctorWorkspace = {
  overview: {
    activePatients: 42,
    redAlerts: 3,
    watchAlerts: 11,
    approvedPlans: 37,
  },
  lowRiskPatients: doctorDashboard,
};

export function getMockPatientReport(patientId: string) {
  const summary = doctorDashboard.find((item) => item.patientId === patientId);

  return {
    patientName: summary?.patientName ?? 'Unknown patient',
    summary: summary?.diagnosisSummary ?? 'Recovery report unavailable',
    latestCheckIn: summary?.latestCheckInSummary ?? 'No check-in found',
    latestScore: summary?.latestScore ?? 100,
    redFlags: summary?.redFlags ?? [],
    meds: ['Paracetamol 500mg twice daily', 'Antibiotic as prescribed'],
    checklist: [
      'Take medicines on time',
      'Complete daily voice check-in',
      'Avoid restricted foods',
      'Call caregiver if pain worsens',
    ],
    alerts: [
      'Caregiver notified for deterioration',
      'Doctor review requested for low recovery score',
    ],
    documents: ['Discharge summary', 'Prescription', 'Diet sheet'],
  };
}
