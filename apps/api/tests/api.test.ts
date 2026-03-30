import assert from 'node:assert/strict';
import test from 'node:test';
import { approveRecoveryPlan, extractClinicalData, generateRecoveryPlanDraft, uploadDocument } from '../src/document-service.ts';
import { getDoctorTopRisk } from '../src/doctor-service.ts';
import { submitCheckIn } from '../src/monitoring-service.ts';
import { createAppStore } from '../src/store.ts';
import { answerVoiceQuery } from '../src/voice-service.ts';

function seedApprovedPlan() {
  const appStore = createAppStore();
  const document = uploadDocument(appStore, {
    patientId: 'patient-1',
    kind: 'discharge-summary',
    fileName: 'appendectomy.pdf',
    uploadedBy: 'patient-user-1',
    text: [
      'Diagnosis: Appendectomy recovery after laparoscopic surgery',
      'Medication: Paracetamol 500mg | twice daily | after food',
      'Medication: Amoxicillin 250mg | three times daily | finish the course',
      'Diet: papaya allowed; spicy food avoid',
      'Activity: walking allowed; lifting heavy weights avoid',
      'Follow-up: 2026-04-05 | Surgery | wound review',
      'Red flags: chest pain, heavy bleeding, fever above 38C',
      'Vitals: temperature < 38C; oxygen > 94',
    ].join('\n'),
  });

  extractClinicalData(appStore, document.id);
  const draft = generateRecoveryPlanDraft(appStore, 'patient-1');
  approveRecoveryPlan(appStore, draft.id, 'doctor-1');

  return { appStore };
}

test('extracts meds, diet, activity, and red flags from uploaded documents', () => {
  const appStore = createAppStore();
  const document = uploadDocument(appStore, {
    patientId: 'patient-1',
    kind: 'prescription',
    fileName: 'discharge.txt',
    uploadedBy: 'patient-user-1',
    text: [
      'Diagnosis: Pneumonia recovery',
      'Medication: Azithromycin 500mg | once daily | for 5 days',
      'Diet: milk allowed; spicy food avoid',
      'Activity: breathing exercises allowed',
      'Red flags: difficulty breathing, oxygen drop',
      'Vitals: oxygen > 94',
    ].join('\n'),
  });

  const extracted = extractClinicalData(appStore, document.id);

  assert.equal(extracted.medications[0]?.name, 'Azithromycin');
  assert.equal(extracted.dietRules.some((rule) => rule.item === 'milk' && rule.allowed), true);
  assert.equal(
    extracted.activityRules.some((rule) => rule.action.includes('breathing exercises') && rule.allowed),
    true,
  );
  assert.equal(extracted.redFlags.includes('difficulty breathing'), true);
});

test('extracts useful structure from less-formatted discharge text', () => {
  const appStore = createAppStore();
  const document = uploadDocument(appStore, {
    patientId: 'patient-1',
    kind: 'discharge-summary',
    fileName: 'freeform.txt',
    uploadedBy: 'patient-user-1',
    text: [
      'Discharge diagnosis appendectomy recovery after surgery.',
      'Take Paracetamol 500mg twice daily after food.',
      'Soft diet, avoid spicy food for one week.',
      'Walking allowed, avoid lifting heavy weights.',
      'Follow up with Surgery on 2026-04-08 for wound review.',
      'Seek help urgently for chest pain, high fever, or heavy bleeding.',
      'Keep temperature below 38C and oxygen above 94.',
    ].join('\n'),
  });

  const extracted = extractClinicalData(appStore, document.id);
  const draft = generateRecoveryPlanDraft(appStore, 'patient-1');

  assert.match(extracted.diagnosisSummary, /appendectomy|recovery/i);
  assert.equal(extracted.medications.some((item) => /paracetamol/i.test(item.name)), true);
  assert.equal(extracted.dietRules.some((rule) => /spicy food/i.test(rule.item) && !rule.allowed), true);
  assert.equal(extracted.activityRules.some((rule) => /walking/i.test(rule.action) && rule.allowed), true);
  assert.equal(extracted.followUps.some((item) => item.date.includes('2026-04-08')), true);
  assert.equal(extracted.redFlags.some((item) => /chest pain/i.test(item)), true);
  assert.match(draft.summary, /appendectomy|recovery/i);
});

test('voice guidance blocks patient-facing plan usage until doctor approval', async () => {
  const appStore = createAppStore();
  const document = uploadDocument(appStore, {
    patientId: 'patient-1',
    kind: 'diet-sheet',
    fileName: 'diet.txt',
    uploadedBy: 'patient-user-1',
    text: 'Diagnosis: Recovery\nDiet: papaya allowed',
  });

  extractClinicalData(appStore, document.id);
  generateRecoveryPlanDraft(appStore, 'patient-1');

  const voice = await answerVoiceQuery(appStore, {
    patientId: 'patient-1',
    question: 'Can I eat papaya?',
    language: 'en',
    channel: 'continuous-listening',
  });

  assert.equal(voice.response.escalate, true);
  assert.match(voice.response.answer, /not approved/i);
});

test('amber check-ins notify caregivers while red flags notify both caregiver and doctor', () => {
  const { appStore } = seedApprovedPlan();

  const amber = submitCheckIn(appStore, {
    patientId: 'patient-1',
    channel: 'manual',
    symptoms: [{ label: 'body pain', severity: 4 }],
    medicationAdherence: 0.7,
    vitals: { temperatureC: 37.6, oxygenSaturation: 96, pulse: 92 },
    appetite: 'reduced',
    mobility: 'limited',
  });

  assert.equal(amber.score.status, 'watch');
  assert.equal(amber.alerts.filter((alert) => alert.recipientRole === 'caregiver').length, 1);
  assert.equal(amber.alerts.filter((alert) => alert.recipientRole === 'doctor').length, 0);

  const red = submitCheckIn(appStore, {
    patientId: 'patient-1',
    channel: 'voice',
    symptoms: [{ label: 'chest pain', severity: 9, notes: 'severe pain while breathing' }],
    medicationAdherence: 0.5,
    vitals: { temperatureC: 38.8, oxygenSaturation: 90, pulse: 122 },
    appetite: 'poor',
    mobility: 'very-limited',
  });

  assert.equal(red.score.status, 'high-risk');
  assert.equal(red.alerts.filter((alert) => alert.recipientRole === 'caregiver').length, 1);
  assert.equal(red.alerts.filter((alert) => alert.recipientRole === 'doctor').length, 1);
});

test('doctor dashboard returns the three lowest-score assigned patients in order', () => {
  const { appStore } = seedApprovedPlan();

  for (const patientId of ['patient-1', 'patient-2', 'patient-3', 'patient-4']) {
    appStore.recoveryPlans.push({
      id: `plan-${patientId}`,
      draftId: `draft-${patientId}`,
      patientId,
      summary: `Approved plan for ${patientId}`,
      dailyChecklist: ['Take meds'],
      medicationPlan: [],
      dietGuidance: [],
      activityGuidance: [],
      followUps: [],
      redFlags: ['chest pain'],
      approvedAt: new Date().toISOString(),
      approvedByDoctorId: 'doctor-1',
    });
  }

  const scoreSeeds = [
    { patientId: 'patient-1', severity: 8, oxygen: 90 },
    { patientId: 'patient-2', severity: 2, oxygen: 97 },
    { patientId: 'patient-3', severity: 6, oxygen: 95 },
    { patientId: 'patient-4', severity: 4, oxygen: 93 },
  ];

  for (const seed of scoreSeeds) {
    submitCheckIn(appStore, {
      patientId: seed.patientId,
      channel: 'manual',
      symptoms: [{ label: 'pain', severity: seed.severity }],
      medicationAdherence: 0.9,
      vitals: { oxygenSaturation: seed.oxygen, temperatureC: 37.2 },
    });
  }

  const topRisk = getDoctorTopRisk(appStore, 'doctor-1');
  assert.equal(topRisk.length, 3);
  assert.equal(topRisk[0]?.patientId, 'patient-1');
  assert.ok((topRisk[0]?.latestScore ?? 100) <= (topRisk[1]?.latestScore ?? 100));
});

test('grounded voice guidance answers papaya safely and asks follow-up questions for mild pain', async () => {
  const { appStore } = seedApprovedPlan();

  const papaya = await answerVoiceQuery(appStore, {
    patientId: 'patient-1',
    question: 'Can I eat papaya?',
    language: 'en',
    channel: 'continuous-listening',
  });

  assert.equal(papaya.response.escalate, false);
  assert.match(papaya.response.answer, /papaya/i);

  const pain = await answerVoiceQuery(appStore, {
    patientId: 'patient-1',
    question: 'I am feeling little pain in my body',
    language: 'hi',
    channel: 'continuous-listening',
  });

  assert.equal(pain.response.followUpQuestions.length > 0, true);
  assert.equal(pain.response.escalate, false);
});

test('local assistant gives broader diet guidance for generic food questions', async () => {
  const { appStore } = seedApprovedPlan();

  const answer = await answerVoiceQuery(appStore, {
    patientId: 'patient-1',
    question: 'What can I eat today?',
    language: 'en',
    channel: 'continuous-listening',
  });

  assert.match(answer.response.answer, /allowed/i);
  assert.match(answer.response.answer, /papaya|spicy food/i);
  assert.equal(answer.response.escalate, false);
});

test('local assistant handles missed medicine questions with safer follow-up', async () => {
  const { appStore } = seedApprovedPlan();

  const answer = await answerVoiceQuery(appStore, {
    patientId: 'patient-1',
    question: 'I missed my medicine today, what should I do?',
    language: 'en',
    channel: 'continuous-listening',
  });

  assert.match(answer.response.answer, /do not double|double the next dose/i);
  assert.equal(answer.response.followUpQuestions.length >= 1, true);
  assert.equal(answer.response.escalate, false);
});
