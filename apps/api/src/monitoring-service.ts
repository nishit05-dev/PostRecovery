import {
  normalizeText,
  redFlagSymptomKeywords,
  type Alert,
  type CheckIn,
  type RecoveryPlan,
  type RecoveryRiskStatus,
  type RecoveryScore,
  type SymptomEntry,
} from '../../../packages/shared/src/index.ts';
import { recordAudit } from './audit.ts';
import { createId } from './id.ts';
import { persistStore, type AppStore } from './store.ts';

function timestamp(): string {
  return new Date().toISOString();
}

function medicationPenalty(adherence: number): number {
  const normalized = adherence > 1 ? adherence / 100 : adherence;
  return Math.max(0, Math.round((1 - normalized) * 25));
}

function symptomPenalty(symptoms: SymptomEntry[]): number {
  return Math.min(
    symptoms.reduce((sum, symptom) => sum + symptom.severity * 4, 0),
    35,
  );
}

function symptomSummary(symptoms: SymptomEntry[]): string {
  if (symptoms.length === 0) {
    return 'No symptoms reported';
  }

  return symptoms.map((symptom) => `${symptom.label} (${symptom.severity}/10)`).join(', ');
}

function detectRedFlags(plan: RecoveryPlan | undefined, checkIn: CheckIn): string[] {
  const findings = new Set<string>();
  const planFlags = (plan?.redFlags ?? []).map((flag) => normalizeText(flag));

  for (const symptom of checkIn.symptoms) {
    const symptomText = normalizeText(`${symptom.label} ${symptom.notes ?? ''}`);
    for (const keyword of [...redFlagSymptomKeywords, ...planFlags]) {
      if (symptomText.includes(normalizeText(keyword))) {
        findings.add(keyword);
      }
    }

    if (symptom.label.toLowerCase().includes('pain') && symptom.severity >= 8) {
      findings.add('severe pain');
    }
  }

  if ((checkIn.vitals.oxygenSaturation ?? 100) < 92) {
    findings.add('oxygen drop');
  }

  if ((checkIn.vitals.temperatureC ?? 36.8) >= 38.5) {
    findings.add('high fever');
  }

  return [...findings];
}

export function submitCheckIn(
  appStore: AppStore,
  input: Omit<CheckIn, 'id' | 'createdAt'>,
): {
  checkIn: CheckIn;
  score: RecoveryScore;
  alerts: Alert[];
} {
  const patient = appStore.patients.find((item) => item.id === input.patientId);
  if (!patient) {
    throw new Error(`Patient ${input.patientId} not found`);
  }

  const checkIn: CheckIn = {
    ...input,
    id: createId('checkin'),
    createdAt: timestamp(),
  };

  const plan = appStore.recoveryPlans.find((item) => item.patientId === checkIn.patientId);
  const previousCheckIn = [...appStore.checkIns]
    .filter((item) => item.patientId === checkIn.patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  const reasons: string[] = [];
  let scoreValue = 100;

  const medPenalty = medicationPenalty(checkIn.medicationAdherence);
  if (medPenalty > 0) {
    scoreValue -= medPenalty;
    reasons.push('Missed or delayed medication doses reported.');
  }

  const symptomCost = symptomPenalty(checkIn.symptoms);
  if (symptomCost > 0) {
    scoreValue -= symptomCost;
    reasons.push(`Symptoms reported: ${symptomSummary(checkIn.symptoms)}.`);
  }

  if ((checkIn.vitals.temperatureC ?? 36.8) > 37.8) {
    scoreValue -= 10;
    reasons.push('Temperature above expected recovery target.');
  }

  if ((checkIn.vitals.oxygenSaturation ?? 100) < 94) {
    scoreValue -= 18;
    reasons.push('Oxygen saturation below safe threshold.');
  }

  if ((checkIn.vitals.pulse ?? 80) > 110) {
    scoreValue -= 8;
    reasons.push('Pulse is elevated.');
  }

  if (
    (checkIn.vitals.bloodPressureSystolic ?? 120) > 160 ||
    (checkIn.vitals.bloodPressureDiastolic ?? 80) > 100
  ) {
    scoreValue -= 10;
    reasons.push('Blood pressure is above the target range.');
  }

  if (checkIn.appetite === 'poor') {
    scoreValue -= 8;
    reasons.push('Poor appetite reported.');
  } else if (checkIn.appetite === 'reduced') {
    scoreValue -= 4;
    reasons.push('Reduced appetite reported.');
  }

  if (checkIn.mobility === 'very-limited') {
    scoreValue -= 10;
    reasons.push('Mobility is very limited.');
  } else if (checkIn.mobility === 'limited') {
    scoreValue -= 6;
    reasons.push('Mobility is limited.');
  }

  if (checkIn.woundStatus === 'bleeding' || checkIn.woundStatus === 'discharge') {
    scoreValue -= 18;
    reasons.push('Wound status suggests possible complication.');
  } else if (checkIn.woundStatus === 'redness') {
    scoreValue -= 10;
    reasons.push('Wound redness reported.');
  }

  if (checkIn.bladderStatus === 'difficulty') {
    scoreValue -= 10;
    reasons.push('Difficulty urinating reported.');
  } else if (checkIn.bladderStatus === 'painful') {
    scoreValue -= 6;
    reasons.push('Painful urination reported.');
  }

  if (checkIn.bowelStatus === 'diarrhea') {
    scoreValue -= 6;
    reasons.push('Diarrhea reported.');
  } else if (checkIn.bowelStatus === 'constipation') {
    scoreValue -= 3;
    reasons.push('Constipation reported.');
  }

  if (previousCheckIn) {
    const previous = new Date(previousCheckIn.createdAt).getTime();
    const current = new Date(checkIn.createdAt).getTime();
    const hoursSincePrevious = (current - previous) / (1000 * 60 * 60);
    if (hoursSincePrevious > 36) {
      scoreValue -= 8;
      reasons.push('Delayed check-in compared with expected daily monitoring.');
    }
  }

  const redFlags = detectRedFlags(plan, checkIn);
  if (redFlags.length > 0) {
    scoreValue = Math.min(scoreValue, 35);
    reasons.push(`Immediate escalation needed for red flags: ${redFlags.join(', ')}.`);
  }

  scoreValue = Math.max(0, Math.min(100, Math.round(scoreValue)));

  let status: RecoveryRiskStatus = 'stable';
  if (redFlags.length > 0 || scoreValue < 50) {
    status = 'high-risk';
  } else if (scoreValue < 75) {
    status = 'watch';
  }

  const score: RecoveryScore = {
    id: createId('score'),
    patientId: checkIn.patientId,
    checkInId: checkIn.id,
    score: scoreValue,
    status,
    reasons,
    createdAt: timestamp(),
  };

  appStore.checkIns.push(checkIn);
  appStore.scores.push(score);

  const alerts: Alert[] = [];
  if (status === 'watch' || status === 'high-risk') {
    for (const caregiverId of patient.caregiverIds) {
      alerts.push({
        id: createId('alert'),
        patientId: patient.id,
        checkInId: checkIn.id,
        severity: status === 'watch' ? 'amber' : 'red',
        recipientRole: 'caregiver',
        recipientId: caregiverId,
        message: `Patient ${patient.id} needs attention: ${reasons.join(' ')}`,
        status: 'open',
        createdAt: timestamp(),
      });
    }
  }

  if (status === 'high-risk') {
    alerts.push({
      id: createId('alert'),
      patientId: patient.id,
      checkInId: checkIn.id,
      severity: 'red',
      recipientRole: 'doctor',
      recipientId: patient.doctorId,
      message: `High-risk deterioration for ${patient.id}: ${reasons.join(' ')}`,
      status: 'open',
      createdAt: timestamp(),
    });
  }

  appStore.alerts.push(...alerts);
  recordAudit(
    appStore,
    checkIn.patientId,
    'patient',
    'check-in.submitted',
    checkIn.id,
    `Score ${score.score} (${score.status}) generated for ${checkIn.patientId}`,
  );

  if (alerts.length > 0) {
    recordAudit(
      appStore,
      'system',
      'system',
      'alert.created',
      alerts[0].id,
      `${alerts.length} alert(s) created for ${checkIn.patientId}`,
    );
  }

  persistStore(appStore);
  return { checkIn, score, alerts };
}
