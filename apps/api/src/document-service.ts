import { normalizeText, type ExtractedClinicalData, type MedicalDocument, type RecoveryPlan, type RecoveryPlanDraft } from '../../../packages/shared/src/index.ts';
import { recordAudit } from './audit.ts';
import { createId } from './id.ts';
import { persistStore, type AppStore } from './store.ts';

function timestamp(): string {
  return new Date().toISOString();
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildCandidateLines(text: string): string[] {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sentenceLines = text
    .replace(/\r?\n/g, '. ')
    .split(/[.]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return uniqueBy([...rawLines, ...sentenceLines], (line) => normalizeText(line));
}

function buildHeuristicMedicationLine(line: string): string | null {
  const normalized = normalizeText(line);
  if (
    /\b\d+\s?(mg|ml|mcg)\b/i.test(line) &&
    /(daily|once|twice|thrice|every|after food|before food|after meals|morning|night|tablet|capsule|syrup)/i.test(line)
  ) {
    return `Medication: ${line}`;
  }
  if (/medicines?:|prescribed:/i.test(line)) {
    return `Medication: ${line.replace(/^(medicines?|prescribed)\s*:/i, '').trim()}`;
  }
  return null;
}

function buildHeuristicDietLine(line: string): string | null {
  if (/(diet|food|eat|allowed|avoid|soft diet|oily|spicy)/i.test(line)) {
    return `Diet: ${line.replace(/^diet\s*:/i, '').trim()}`;
  }
  return null;
}

function buildHeuristicActivityLine(line: string): string | null {
  if (/(activity|walk|walking|exercise|stairs|lifting|rest|bath|mobilize)/i.test(line)) {
    return `Activity: ${line.replace(/^activity\s*:/i, '').trim()}`;
  }
  return null;
}

function buildHeuristicFollowUpLine(line: string): string | null {
  if (/(follow.?up|review|appointment|revisit)/i.test(line) && /(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/.test(line)) {
    return `Follow-up: ${line.replace(/^follow-?up\s*:/i, '').trim()}`;
  }
  return null;
}

function buildHeuristicRedFlagLine(line: string): string | null {
  if (/(red flag|warning|seek help|emergency|bleeding|breathing|chest pain|fever|vomiting|faint)/i.test(line)) {
    return `Red flags: ${line.replace(/^red flags?\s*:/i, '').trim()}`;
  }
  return null;
}

function buildHeuristicVitalsLine(line: string): string | null {
  if (/(temperature|oxygen|pulse|bp|blood pressure|spo2)/i.test(line)) {
    return `Vitals: ${line.replace(/^vitals\s*:/i, '').trim()}`;
  }
  return null;
}

function buildHeuristicDiagnosisLine(line: string): string | null {
  if (/(diagnosis|diagnosed|discharge diagnosis|post.?op|postoperative|recovery after|status post)/i.test(line)) {
    return `Diagnosis: ${line.replace(/^(diagnosis|diagnosed|discharge diagnosis)\s*:/i, '').trim()}`;
  }
  return null;
}

function enrichLines(lines: string[]): string[] {
  const enriched = [...lines];

  for (const line of lines) {
    const heuristics = [
      buildHeuristicDiagnosisLine(line),
      buildHeuristicMedicationLine(line),
      buildHeuristicDietLine(line),
      buildHeuristicActivityLine(line),
      buildHeuristicFollowUpLine(line),
      buildHeuristicRedFlagLine(line),
      buildHeuristicVitalsLine(line),
    ].filter((item): item is string => Boolean(item));

    enriched.push(...heuristics);
  }

  return uniqueBy(enriched, (line) => normalizeText(line));
}

function parseMedicationLines(lines: string[]): ExtractedClinicalData['medications'] {
  return lines
    .filter((line) => /^(medication|rx)\s*:/i.test(line))
    .map((line) => line.replace(/^(medication|rx)\s*:/i, '').trim())
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      const [nameAndDose = '', explicitSchedule = '', explicitNotes = ''] = parts;
      const dosageMatch = line.match(/\b\d+\s?(?:mg|ml|mcg)\b/i);
      const scheduleMatch = line.match(
        /\b(?:once daily|twice daily|three times daily|thrice daily|every \d+ hours|morning|night|after food|before food|after meals|with food)\b/i,
      );
      const doseMatch = nameAndDose.match(/^(.*?)(\d+\s?(?:mg|ml|mcg))$/i);
      const derivedName = dosageMatch
        ? line
            .replace(dosageMatch[0], '')
            .replace(scheduleMatch?.[0] ?? '', '')
            .replace(/\b(?:tablet|capsule|syrup|take|tab)\b/gi, '')
            .trim()
        : nameAndDose;

      return {
        name: doseMatch ? doseMatch[1].trim() : derivedName.trim(),
        dosage: doseMatch ? doseMatch[2].trim() : dosageMatch?.[0] ?? 'as prescribed',
        schedule: explicitSchedule || scheduleMatch?.[0] || 'as prescribed',
        notes: explicitNotes || undefined,
      };
    })
    .filter((medication) => medication.name.length > 0);
}

function parseDietLines(lines: string[]): ExtractedClinicalData['dietRules'] {
  const rules = lines
    .filter((line) => /^diet\s*:/i.test(line))
    .flatMap((line) => line.replace(/^diet\s*:/i, '').split(/[;,]/))
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const allowed = /allowed|can eat|okay/i.test(segment) && !/avoid|no /i.test(segment);
      const item = segment
        .replace(/\ballowed\b/gi, '')
        .replace(/\bcan eat\b/gi, '')
        .replace(/\bavoid\b/gi, '')
        .replace(/\bno\b/gi, '')
        .trim();

      return {
        item,
        allowed,
        reason: allowed ? 'Document-approved diet item' : 'Document restriction',
      };
    })
    .filter((rule) => rule.item.length > 0);

  return uniqueBy(rules, (rule) => `${normalizeText(rule.item)}:${rule.allowed}`);
}

function parseActivityLines(lines: string[]): ExtractedClinicalData['activityRules'] {
  const rules = lines
    .filter((line) => /^activity\s*:/i.test(line))
    .flatMap((line) => line.replace(/^activity\s*:/i, '').split(/[;,]/))
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const allowed = /allowed|walk|mobilize|exercise/i.test(segment) && !/avoid|no /i.test(segment);
      const action = segment
        .replace(/\ballowed\b/gi, '')
        .replace(/\bavoid\b/gi, '')
        .replace(/\bno\b/gi, '')
        .trim();

      return {
        action,
        allowed,
        notes: allowed ? 'Safe activity from discharge notes' : 'Restricted activity from discharge notes',
      };
    })
    .filter((rule) => rule.action.length > 0);

  return uniqueBy(rules, (rule) => `${normalizeText(rule.action)}:${rule.allowed}`);
}

function parseFollowUps(lines: string[]): ExtractedClinicalData['followUps'] {
  return lines
    .filter((line) => /^follow-?up\s*:/i.test(line))
    .map((line) => line.replace(/^follow-?up\s*:/i, '').trim())
    .map((line) => {
      const [datePart = '', departmentPart = '', notesPart = ''] = line
        .split('|')
        .map((part) => part.trim());
      const dateMatch = datePart.match(/\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/);
      const inferredDepartment =
        departmentPart ||
        (/(surgery|surgeon)/i.test(line)
          ? 'Surgery'
          : /(ortho)/i.test(line)
            ? 'Orthopedics'
            : /(pulmo|lung|respir)/i.test(line)
              ? 'Pulmonology'
              : 'General medicine');

      return {
        date: dateMatch?.[0] ?? datePart,
        department: inferredDepartment,
        notes: notesPart || line.replace(dateMatch?.[0] ?? '', '').replace(inferredDepartment, '').trim() || undefined,
      };
    })
    .filter((followUp) => followUp.date.length > 0);
}

function parseRedFlags(lines: string[]): string[] {
  return uniqueBy(
    lines
      .filter((line) => /^red flags?\s*:/i.test(line))
      .flatMap((line) => line.replace(/^red flags?\s*:/i, '').split(/[;,]/))
      .map((flag) => flag.trim())
      .filter(Boolean),
    (flag) => normalizeText(flag),
  );
}

function parseVitals(lines: string[]): ExtractedClinicalData['vitalsInstructions'] {
  return lines
    .filter((line) => /^vitals\s*:/i.test(line))
    .flatMap((line) => line.replace(/^vitals\s*:/i, '').split(';'))
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const lowered = normalizeText(segment);
      if (lowered.includes('temperature')) {
        return { metric: 'temperature', target: segment, notes: 'Temperature monitoring' } as const;
      }
      if (lowered.includes('oxygen')) {
        return { metric: 'oxygen', target: segment, notes: 'Oxygen monitoring' } as const;
      }
      if (lowered.includes('bp') || lowered.includes('blood pressure')) {
        return { metric: 'blood-pressure', target: segment, notes: 'Blood pressure monitoring' } as const;
      }
      return { metric: 'pulse', target: segment, notes: 'Pulse monitoring' } as const;
    });
}

export function uploadDocument(
  appStore: AppStore,
  input: Pick<MedicalDocument, 'patientId' | 'kind' | 'fileName' | 'uploadedBy' | 'text'>,
): MedicalDocument {
  const document: MedicalDocument = {
    id: createId('doc'),
    patientId: input.patientId,
    kind: input.kind,
    fileName: input.fileName,
    uploadedBy: input.uploadedBy,
    text: input.text,
    status: 'uploaded',
    createdAt: timestamp(),
  };

  appStore.documents.push(document);
  recordAudit(
    appStore,
    input.uploadedBy,
    'patient',
    'document.uploaded',
    document.id,
    `${document.kind} uploaded for ${document.patientId}`,
  );
  persistStore(appStore);
  return document;
}

export function extractClinicalData(
  appStore: AppStore,
  documentId: string,
): ExtractedClinicalData {
  const document = appStore.documents.find((item) => item.id === documentId);
  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }

  const lines = enrichLines(buildCandidateLines(document.text));

  const diagnosisLine =
    lines.find((line) => /^diagnosis\s*:/i.test(line)) ??
    `Diagnosis: ${appStore.patients.find((patient) => patient.id === document.patientId)?.diagnosisSummary ?? 'Post-discharge recovery'}`;

  const extracted: ExtractedClinicalData = {
    id: createId('extract'),
    documentId: document.id,
    patientId: document.patientId,
    diagnosisSummary: diagnosisLine.replace(/^diagnosis\s*:/i, '').trim(),
    medications: parseMedicationLines(lines),
    dietRules: parseDietLines(lines),
    activityRules: parseActivityLines(lines),
    followUps: parseFollowUps(lines),
    redFlags: parseRedFlags(lines),
    vitalsInstructions: parseVitals(lines),
    createdAt: timestamp(),
  };

  document.status = 'extracted';
  appStore.extractedData.push(extracted);
  recordAudit(
    appStore,
    'system',
    'system',
    'document.extracted',
    extracted.id,
    `Structured extraction created for ${document.id}`,
  );
  persistStore(appStore);
  return extracted;
}

export function generateRecoveryPlanDraft(
  appStore: AppStore,
  patientId: string,
): RecoveryPlanDraft {
  const patientDocuments = appStore.documents.filter((document) => document.patientId === patientId);
  const extractedItems = appStore.extractedData.filter((item) => item.patientId === patientId);

  if (extractedItems.length === 0) {
    throw new Error(`No extracted clinical data available for ${patientId}`);
  }

  const diagnosisSummary = uniqueBy(
    extractedItems.map((item) => item.diagnosisSummary).filter(Boolean),
    (item) => normalizeText(item),
  )[0];

  const medicationPlan = uniqueBy(
    extractedItems.flatMap((item) => item.medications),
    (medication) =>
      normalizeText(`${medication.name}-${medication.dosage}-${medication.schedule}-${medication.notes ?? ''}`),
  );

  const dietGuidance = uniqueBy(
    extractedItems.flatMap((item) => item.dietRules),
    (rule) => normalizeText(`${rule.item}-${rule.allowed}`),
  );

  const activityGuidance = uniqueBy(
    extractedItems.flatMap((item) => item.activityRules),
    (rule) => normalizeText(`${rule.action}-${rule.allowed}`),
  );

  const followUps = uniqueBy(
    extractedItems.flatMap((item) => item.followUps),
    (followUp) => normalizeText(`${followUp.date}-${followUp.department}`),
  );

  const redFlags = uniqueBy(
    extractedItems.flatMap((item) => item.redFlags),
    (flag) => normalizeText(flag),
  );

  const dailyChecklist = uniqueBy(
    [
      'Take all prescribed medications on time.',
      'Complete the daily symptom check-in.',
      'Record temperature, BP, oxygen, and pulse if instructed.',
      'Follow diet and activity restrictions from the approved plan.',
      ...followUps.map((followUp) => `Attend follow-up with ${followUp.department} on ${followUp.date}.`),
    ],
    (item) => normalizeText(item),
  );

  const draft: RecoveryPlanDraft = {
    id: createId('draft'),
    patientId,
    sourceDocumentIds: patientDocuments.map((document) => document.id),
    extractedDataIds: extractedItems.map((item) => item.id),
    summary: `${diagnosisSummary}. Focus on medication adherence, symptom monitoring, and escalation for red flags.`,
    dailyChecklist,
    medicationPlan,
    dietGuidance,
    activityGuidance,
    followUps,
    redFlags,
    createdByAiAt: timestamp(),
  };

  appStore.recoveryPlanDrafts.push(draft);
  recordAudit(
    appStore,
    'system',
    'system',
    'recovery-plan.drafted',
    draft.id,
    `AI draft generated for ${patientId}`,
  );
  persistStore(appStore);
  return draft;
}

export function approveRecoveryPlan(
  appStore: AppStore,
  draftId: string,
  doctorId: string,
): RecoveryPlan {
  const draft = appStore.recoveryPlanDrafts.find((item) => item.id === draftId);
  if (!draft) {
    throw new Error(`Recovery plan draft ${draftId} not found`);
  }

  const patient = appStore.patients.find((item) => item.id === draft.patientId);
  if (!patient) {
    throw new Error(`Patient ${draft.patientId} not found`);
  }

  if (patient.doctorId !== doctorId) {
    throw new Error(`Doctor ${doctorId} is not assigned to ${draft.patientId}`);
  }

  const plan: RecoveryPlan = {
    id: createId('plan'),
    draftId: draft.id,
    patientId: draft.patientId,
    summary: draft.summary,
    dailyChecklist: draft.dailyChecklist,
    medicationPlan: draft.medicationPlan,
    dietGuidance: draft.dietGuidance,
    activityGuidance: draft.activityGuidance,
    followUps: draft.followUps,
    redFlags: draft.redFlags,
    approvedAt: timestamp(),
    approvedByDoctorId: doctorId,
  };

  appStore.recoveryPlans = appStore.recoveryPlans.filter((item) => item.patientId !== plan.patientId);
  appStore.recoveryPlans.push(plan);
  recordAudit(
    appStore,
    doctorId,
    'doctor',
    'recovery-plan.approved',
    plan.id,
    `Doctor approved plan for ${plan.patientId}`,
  );
  persistStore(appStore);
  return plan;
}
