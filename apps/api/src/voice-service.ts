import {
  curatedFoodRules,
  getLocalizedText,
  normalizeText,
  redFlagSymptomKeywords,
  type Language,
  type RecoveryPlan,
  type User,
  type VoiceQueryResponse,
  type VoiceSession,
} from '../../../packages/shared/src/index.ts';
import { recordAudit } from './audit.ts';
import { createId } from './id.ts';
import { generateGroundedAssistantResponse } from './llm-service.ts';
import { persistStore, type AppStore } from './store.ts';

function timestamp(): string {
  return new Date().toISOString();
}

function getPatientUser(appStore: AppStore, patientId: string): User | undefined {
  const patient = appStore.patients.find((item) => item.id === patientId);
  return appStore.users.find((item) => item.id === patient?.userId);
}

function getPatientPlan(appStore: AppStore, patientId: string): RecoveryPlan | undefined {
  return appStore.recoveryPlans.find((item) => item.patientId === patientId);
}

function getLatestScore(appStore: AppStore, patientId: string) {
  return [...appStore.scores]
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function getLatestCheckIn(appStore: AppStore, patientId: string) {
  return [...appStore.checkIns]
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function getLatestRecommendation(appStore: AppStore, patientId: string) {
  return [...appStore.doctorRecommendations]
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function getRecentDocumentSnippets(appStore: AppStore, patientId: string): string[] {
  return [...appStore.documents]
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 3)
    .map((item) => `${item.kind}: ${item.text.replace(/\s+/g, ' ').trim().slice(0, 500)}`);
}

function buildPatientContext(appStore: AppStore, patientId: string): string {
  const patientUser = getPatientUser(appStore, patientId);
  const plan = getPatientPlan(appStore, patientId);
  const latestScore = getLatestScore(appStore, patientId);
  const latestCheckIn = getLatestCheckIn(appStore, patientId);
  const latestRecommendation = getLatestRecommendation(appStore, patientId);
  const extracted = [...appStore.extractedData]
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const documentSnippets = getRecentDocumentSnippets(appStore, patientId);

  return JSON.stringify(
    {
      patientId,
      patientName: patientUser?.name,
      approvedPlan: plan
        ? {
            summary: plan.summary,
            medicationPlan: plan.medicationPlan,
            dietGuidance: plan.dietGuidance,
            activityGuidance: plan.activityGuidance,
            followUps: plan.followUps,
            redFlags: plan.redFlags,
            dailyChecklist: plan.dailyChecklist,
          }
        : null,
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
            medicationAdherence: latestCheckIn.medicationAdherence,
            vitals: latestCheckIn.vitals,
            appetite: latestCheckIn.appetite,
            mobility: latestCheckIn.mobility,
            notes: latestCheckIn.notes,
          }
        : null,
      latestDoctorRecommendation: latestRecommendation?.message ?? null,
      extractedClinicalData: extracted
        ? {
            diagnosisSummary: extracted.diagnosisSummary,
            medications: extracted.medications,
            dietRules: extracted.dietRules,
            activityRules: extracted.activityRules,
            followUps: extracted.followUps,
            redFlags: extracted.redFlags,
            vitalsInstructions: extracted.vitalsInstructions,
          }
        : null,
      recentDocumentSnippets: documentSnippets,
    },
    null,
    2,
  );
}

function buildLocalizedFollowUps(language: Language): string[] {
  return [
    getLocalizedText(language, 'What is the pain severity from 1 to 10?', 'Dard 1 se 10 mein kitna hai?'),
    getLocalizedText(language, 'Where is the pain located?', 'Dard sharir ke kis hisse mein hai?'),
    getLocalizedText(language, 'How long have you felt this symptom?', 'Yeh lakshan kab se hai?'),
  ];
}

type PatientSnapshot = {
  patientUser?: User;
  plan: RecoveryPlan;
  latestScore?: AppStore['scores'][number];
  previousScore?: AppStore['scores'][number];
  latestCheckIn?: AppStore['checkIns'][number];
  latestRecommendation?: AppStore['doctorRecommendations'][number];
  recentVoiceSessions: VoiceSession[];
};

function includesAny(normalized: string, terms: string[]): boolean {
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function hashText(seed: string): number {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function pickVariant(seed: string, options: string[]): string {
  return options[hashText(seed) % options.length] ?? options[0] ?? '';
}

function formatList(items: string[]): string {
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0]!;
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function buildSnapshot(appStore: AppStore, patientId: string, plan: RecoveryPlan): PatientSnapshot {
  const orderedScores = [...appStore.scores]
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const orderedCheckIns = [...appStore.checkIns]
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const orderedRecommendations = [...appStore.doctorRecommendations]
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const recentVoiceSessions = [...appStore.voiceSessions]
    .filter((item) => item.patientId === patientId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 4);

  return {
    patientUser: getPatientUser(appStore, patientId),
    plan,
    latestScore: orderedScores[0],
    previousScore: orderedScores[1],
    latestCheckIn: orderedCheckIns[0],
    latestRecommendation: orderedRecommendations[0],
    recentVoiceSessions,
  };
}

function findMention(question: string, candidates: string[]): string | undefined {
  const normalizedQuestion = normalizeText(question);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeText(candidate);
    if (normalizedQuestion.includes(normalizedCandidate)) {
      return candidate;
    }

    const words = normalizedCandidate.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.every((word) => normalizedQuestion.includes(word))) {
      return candidate;
    }
  }

  return undefined;
}

function findFoodMention(question: string, snapshot: PatientSnapshot): string | undefined {
  return findMention(question, [
    ...snapshot.plan.dietGuidance.map((rule) => rule.item),
    ...curatedFoodRules.map((rule) => rule.item),
  ]);
}

function findMedicationMention(question: string, snapshot: PatientSnapshot): string | undefined {
  return findMention(question, snapshot.plan.medicationPlan.map((item) => item.name));
}

function inferSeverity(question: string): 'mild' | 'moderate' | 'severe' {
  const normalized = normalizeText(question);
  const numeric = normalized.match(/\b(10|[1-9])\b/);
  if (numeric) {
    const value = Number(numeric[1]);
    if (value >= 7) {
      return 'severe';
    }
    if (value >= 4) {
      return 'moderate';
    }
    return 'mild';
  }

  if (includesAny(normalized, ['severe', 'very bad', 'worst', 'unbearable', 'urgent'])) {
    return 'severe';
  }
  if (includesAny(normalized, ['moderate', 'worse', 'increasing'])) {
    return 'moderate';
  }
  return 'mild';
}

function buildTrendSentence(snapshot: PatientSnapshot, language: Language): string {
  if (!snapshot.latestScore) {
    return getLocalizedText(
      language,
      'I do not have a recent recovery score yet.',
      'Mere paas abhi recent recovery score nahi hai.',
    );
  }

  if (!snapshot.previousScore) {
    return getLocalizedText(
      language,
      `Your latest recovery score is ${snapshot.latestScore.score} and the current status is ${snapshot.latestScore.status}.`,
      `Aapka latest recovery score ${snapshot.latestScore.score} hai aur current status ${snapshot.latestScore.status} hai.`,
    );
  }

  const delta = snapshot.latestScore.score - snapshot.previousScore.score;
  const trend =
    delta >= 6
      ? getLocalizedText(language, 'This looks better than the last score.', 'Yeh pichhle score se better lag raha hai.')
      : delta <= -6
        ? getLocalizedText(language, 'This looks worse than the last score.', 'Yeh pichhle score se worse lag raha hai.')
        : getLocalizedText(language, 'This is close to the last score.', 'Yeh pichhle score ke kareeb hai.');

  return getLocalizedText(
    language,
    `Your latest recovery score is ${snapshot.latestScore.score} and the current status is ${snapshot.latestScore.status}. ${trend}`,
    `Aapka latest recovery score ${snapshot.latestScore.score} hai aur current status ${snapshot.latestScore.status} hai. ${trend}`,
  );
}

function buildRecommendationSentence(snapshot: PatientSnapshot, language: Language): string {
  if (!snapshot.latestRecommendation) {
    return '';
  }

  return getLocalizedText(
    language,
    `Latest doctor recommendation: ${snapshot.latestRecommendation.message}`,
    `Doctor ki latest recommendation: ${snapshot.latestRecommendation.message}`,
  );
}

function buildMedicationAnswer(
  snapshot: PatientSnapshot,
  question: string,
  language: Language,
): VoiceQueryResponse {
  if (snapshot.plan.medicationPlan.length === 0) {
    return {
      answer: getLocalizedText(
        language,
        'I do not see a medication list in your approved plan yet. Please review the uploaded prescription with your doctor.',
        'Mujhe approved plan mein abhi dawa ki list nahi dikh rahi. Kripaya prescription ko doctor ke saath review karein.',
      ),
      confidence: 0.45,
      escalate: true,
      followUpQuestions: [],
      grounding: ['approved medication plan'],
    };
  }

  const mentionedMedication = findMedicationMention(question, snapshot);
  const selectedMedications = mentionedMedication
    ? snapshot.plan.medicationPlan.filter(
        (item) => normalizeText(item.name) === normalizeText(mentionedMedication),
      )
    : snapshot.plan.medicationPlan.slice(0, 3);
  const summary = selectedMedications
    .map((item) => `${item.name} ${item.dosage} - ${item.schedule}`)
    .join('; ');
  const adherenceNote =
    snapshot.latestCheckIn && snapshot.latestCheckIn.medicationAdherence < 0.8
      ? getLocalizedText(
          language,
          'Your last check-in also showed missed or delayed doses, so stay close to the written schedule.',
          'Aapke last check-in mein kuch missed ya delayed doses bhi dikhe the, isliye schedule ko dhyan se follow karein.',
        )
      : '';
  const forgotDose = includesAny(normalizeText(question), ['missed', 'forgot', 'skip', 'chhoot']);

  if (forgotDose) {
    return {
      answer: getLocalizedText(
        language,
        `Do not double the next dose unless your doctor specifically told you to. ${
          mentionedMedication
            ? `Your plan shows ${summary}.`
            : `Your current medicines are ${summary}.`
        } ${adherenceNote}`.trim(),
        `Agar doctor ne khas taur par na kaha ho to agli dose double na karein. ${
          mentionedMedication
            ? `Aapke plan mein ${summary} likha hai.`
            : `Aapki current medicines ${summary} hain.`
        } ${adherenceNote}`.trim(),
      ),
      confidence: 0.83,
      escalate: false,
      followUpQuestions: [
        getLocalizedText(language, 'Which medicine did you miss?', 'Kaunsi medicine miss hui?'),
        getLocalizedText(language, 'When was the last dose taken?', 'Last dose kab li thi?'),
      ],
      grounding: ['approved medication plan', 'latest medication adherence'],
    };
  }

  return {
    answer: getLocalizedText(
      language,
      `${pickVariant(question, [
        'From your approved plan, ',
        'Looking at your current medication list, ',
        'Your recovery plan says ',
      ])}${mentionedMedication ? `${summary}.` : `your medicines are ${summary}.`} ${
        adherenceNote ? `${adherenceNote} ` : ''
      }Only take medicines exactly as prescribed.`,
      `${mentionedMedication ? `${summary}.` : `Aapki medicines ${summary} hain.`} ${
        adherenceNote ? `${adherenceNote} ` : ''
      }Dawa sirf prescribed tareeke se hi lein.`,
    ),
    confidence: 0.9,
    escalate: false,
    followUpQuestions: [],
    grounding: mentionedMedication
      ? [`approved medication plan: ${mentionedMedication}`]
      : ['approved medication plan'],
  };
}

function buildFollowUpAnswer(snapshot: PatientSnapshot, language: Language): VoiceQueryResponse {
  const nextFollowUp = snapshot.plan.followUps[0];
  if (!nextFollowUp) {
    return {
      answer: getLocalizedText(
        language,
        'I do not see a follow-up appointment in the approved plan yet. Please confirm the review date with your doctor.',
        'Approved plan mein abhi follow-up appointment nahi dikh rahi. Kripaya doctor se review date confirm karein.',
      ),
      confidence: 0.5,
      escalate: false,
      followUpQuestions: [],
      grounding: ['approved follow-up plan'],
    };
  }

  return {
    answer: getLocalizedText(
      language,
      `Your next follow-up is with ${nextFollowUp.department} on ${nextFollowUp.date}${nextFollowUp.notes ? ` for ${nextFollowUp.notes}` : ''}. ${
        buildRecommendationSentence(snapshot, language)
      }`.trim(),
      `Aapka agla follow-up ${nextFollowUp.department} ke saath ${nextFollowUp.date} ko hai${nextFollowUp.notes ? `, ${nextFollowUp.notes} ke liye` : ''}. ${
        buildRecommendationSentence(snapshot, language)
      }`.trim(),
    ),
    confidence: 0.92,
    escalate: false,
    followUpQuestions: [],
    grounding: ['approved follow-up plan'],
  };
}

function buildDietAnswer(
  snapshot: PatientSnapshot,
  question: string,
  language: Language,
): VoiceQueryResponse {
  const normalizedQuestion = normalizeText(question);
  const foodItem = findFoodMention(question, snapshot);
  const dietRule = snapshot.plan.dietGuidance.find(
    (rule) => normalizeText(rule.item) === normalizeText(foodItem ?? ''),
  );
  const curatedRule = curatedFoodRules.find(
    (rule) => normalizeText(rule.item) === normalizeText(foodItem ?? ''),
  );
  const allowedItems = snapshot.plan.dietGuidance.filter((rule) => rule.allowed).map((rule) => rule.item);
  const restrictedItems = snapshot.plan.dietGuidance.filter((rule) => !rule.allowed).map((rule) => rule.item);
  const appetiteNote =
    snapshot.latestCheckIn?.appetite === 'poor'
      ? getLocalizedText(
          language,
          'Because your latest check-in showed poor appetite, keep meals small and simple.',
          'Aapke latest check-in mein poor appetite dikh rahi thi, isliye meal chhota aur simple rakhein.',
        )
      : snapshot.latestCheckIn?.appetite === 'reduced'
        ? getLocalizedText(
            language,
            'Because appetite is reduced, take lighter meals and do not force large portions.',
            'Appetite reduced hai, isliye halka meal lein aur bada portion force na karein.',
          )
        : '';

  if (dietRule && !dietRule.allowed) {
    return {
      answer: getLocalizedText(
        language,
        `No, avoid ${dietRule.item} because your approved plan marks it as restricted. ${
          restrictedItems.length > 1 ? `Other things to avoid right now include ${formatList(restrictedItems.filter((item) => item !== dietRule.item).slice(0, 2))}.` : ''
        } ${appetiteNote}`.trim(),
        `${dietRule.item} ko abhi avoid karein kyunki approved plan mein yeh restricted hai. ${appetiteNote}`.trim(),
      ),
      confidence: 0.95,
      escalate: false,
      followUpQuestions: [],
      grounding: [`approved plan diet restriction: ${dietRule.item}`, 'latest appetite status'],
    };
  }

  if (dietRule && dietRule.allowed) {
    return {
      answer: getLocalizedText(
        language,
        `Yes, ${dietRule.item} is allowed in your approved plan. ${
          restrictedItems.length > 0 ? `Keep following the rest of the diet precautions and still avoid ${formatList(restrictedItems.slice(0, 2))}.` : ''
        } ${appetiteNote}`.trim(),
        `Haan, ${dietRule.item} aapke approved plan mein allowed hai. ${appetiteNote}`.trim(),
      ),
      confidence: 0.92,
      escalate: false,
      followUpQuestions: [],
      grounding: [`approved plan diet allowance: ${dietRule.item}`, 'latest appetite status'],
    };
  }

  if (curatedRule) {
    return {
      answer: getLocalizedText(
        language,
        `${curatedRule.guidance} ${
          restrictedItems.length > 0 ? `Your own plan also clearly asks you to avoid ${formatList(restrictedItems.slice(0, 2))}.` : ''
        } ${appetiteNote}`.trim(),
        `${curatedRule.hindiGuidance} ${appetiteNote}`.trim(),
      ),
      confidence: 0.71,
      escalate: false,
      followUpQuestions: [],
      grounding: [`curated recovery diet rule for ${curatedRule.item}`, 'approved plan diet guidance'],
    };
  }

  if (
    includesAny(normalizedQuestion, ['what can i eat', 'what should i eat', 'diet today', 'kya kha'])
  ) {
    const answerParts = [
      allowedItems.length > 0
        ? getLocalizedText(
            language,
            `Foods clearly allowed in your plan include ${formatList(allowedItems.slice(0, 3))}.`,
            `Aapke plan mein allowed foods mein ${formatList(allowedItems.slice(0, 3))} shamil hain.`,
          )
        : getLocalizedText(
            language,
            'I do not see a detailed allowed-food list, so keep meals simple and follow the restrictions below.',
            'Mujhe detailed allowed-food list nahi dikh rahi, isliye meal simple rakhein aur restrictions follow karein.',
          ),
      restrictedItems.length > 0
        ? getLocalizedText(
            language,
            `Avoid ${formatList(restrictedItems.slice(0, 3))}.`,
            `${formatList(restrictedItems.slice(0, 3))} ko avoid karein.`,
          )
        : '',
      appetiteNote,
    ].filter(Boolean);

    return {
      answer: answerParts.join(' '),
      confidence: 0.85,
      escalate: false,
      followUpQuestions: [],
      grounding: ['approved diet guidance', 'latest appetite status'],
    };
  }

  return {
    answer: getLocalizedText(
      language,
      `I cannot confirm that specific food from your approved plan. What I can confirm is that ${
        allowedItems.length > 0 ? `${formatList(allowedItems.slice(0, 3))} are allowed` : 'some foods are allowed'
      } and ${
        restrictedItems.length > 0 ? `${formatList(restrictedItems.slice(0, 3))} should be avoided` : 'I do not see a full restriction list yet'
      }. ${appetiteNote}`.trim(),
      `Main us specific food ko approved plan se confirm nahi kar paa raha. ${appetiteNote}`.trim(),
    ),
    confidence: 0.52,
    escalate: false,
    followUpQuestions: [
      getLocalizedText(language, 'Which food item do you want to check?', 'Kaunsa food item check karna hai?'),
    ],
    grounding: ['approved diet guidance', 'curated diet rules'],
  };
}

function buildActivityAnswer(
  snapshot: PatientSnapshot,
  question: string,
  language: Language,
): VoiceQueryResponse {
  const mentionedAction = findMention(question, snapshot.plan.activityGuidance.map((item) => item.action));
  const matchedRule = snapshot.plan.activityGuidance.find(
    (item) => normalizeText(item.action) === normalizeText(mentionedAction ?? ''),
  );
  const allowed = snapshot.plan.activityGuidance.filter((item) => item.allowed).map((item) => item.action);
  const restricted = snapshot.plan.activityGuidance.filter((item) => !item.allowed).map((item) => item.action);

  if (matchedRule) {
    return {
      answer: getLocalizedText(
        language,
        matchedRule.allowed
          ? `${matchedRule.action} is allowed in your approved plan. ${matchedRule.notes || ''}`.trim()
          : `Please avoid ${matchedRule.action} for now because your approved plan restricts it. ${matchedRule.notes || ''}`.trim(),
        matchedRule.allowed
          ? `${matchedRule.action} aapke approved plan mein allowed hai. ${matchedRule.notes || ''}`.trim()
          : `${matchedRule.action} ko abhi avoid karein kyunki approved plan mein restriction hai. ${matchedRule.notes || ''}`.trim(),
      ),
      confidence: 0.9,
      escalate: false,
      followUpQuestions: [],
      grounding: [`approved activity guidance: ${matchedRule.action}`],
    };
  }

  const parts = [
    allowed.length > 0 ? `Allowed: ${formatList(allowed.slice(0, 3))}.` : '',
    restricted.length > 0 ? `Avoid: ${formatList(restricted.slice(0, 3))}.` : '',
    snapshot.latestScore?.status === 'watch'
      ? getLocalizedText(
          language,
          'Because your latest status is watch, take it easy today and avoid pushing through symptoms.',
          'Aapka latest status watch hai, isliye aaj zyada strain na lein.',
        )
      : '',
  ].filter(Boolean);

  return {
    answer: getLocalizedText(
      language,
      parts.join(' ') || 'I do not see specific activity instructions yet. Please avoid strain until your doctor confirms.',
      parts.join(' ') || 'Mujhe specific activity instructions abhi nahi dikh rahi. Doctor confirm karein tab tak zyada strain na lein.',
    ),
    confidence: parts.length > 0 ? 0.88 : 0.46,
    escalate: false,
    followUpQuestions: [],
    grounding: ['approved activity guidance', 'latest recovery status'],
  };
}

function buildProgressAnswer(snapshot: PatientSnapshot, language: Language): VoiceQueryResponse {
  const symptomSummary =
    snapshot.latestCheckIn?.symptoms.map((symptom) => `${symptom.label} ${symptom.severity}/10`).join(', ') ??
    'no symptoms reported recently';

  return {
    answer: getLocalizedText(
      language,
      `${buildTrendSentence(snapshot, language)} Latest check-in shows ${symptomSummary}. ${
        buildRecommendationSentence(snapshot, language) ||
        'No new doctor recommendation has been added yet.'
      }`,
      `${buildTrendSentence(snapshot, language)} Latest check-in mein ${symptomSummary} dikh raha hai. ${
        buildRecommendationSentence(snapshot, language) ||
        'Abhi koi nayi doctor recommendation add nahi hui hai.'
      }`,
    ),
    confidence: 0.86,
    escalate: snapshot.latestScore?.status === 'high-risk',
    followUpQuestions: [],
    grounding: ['latest recovery score', 'latest check-in', 'latest doctor recommendation'],
  };
}

function buildSymptomAnswer(
  snapshot: PatientSnapshot,
  question: string,
  language: Language,
): VoiceQueryResponse {
  const normalizedQuestion = normalizeText(question);
  const severity = inferSeverity(question);
  const redFlagMention =
    redFlagSymptomKeywords.some((keyword) => normalizedQuestion.includes(normalizeText(keyword))) ||
    snapshot.plan.redFlags.some((keyword) => normalizedQuestion.includes(normalizeText(keyword)));
  const latestPainMedicine = snapshot.plan.medicationPlan.find((item) =>
    includesAny(item.name.toLowerCase(), ['paracetamol', 'acetaminophen', 'ibuprofen', 'pain']),
  );

  if (severity === 'severe' || redFlagMention) {
    return {
      answer: getLocalizedText(
        language,
        `This sounds high-risk because it matches a red-flag symptom or severe symptom pattern in your recovery plan. Please contact your caregiver and doctor now. If you have chest pain, breathing trouble, heavy bleeding, faintness, or rapidly worsening symptoms, seek emergency help immediately.`,
        `Yeh high-risk lag raha hai kyunki yeh aapke recovery plan ke red-flag ya severe symptom pattern se milta hai. Kripaya caregiver aur doctor se abhi contact karein. Agar chest pain, breathing trouble, heavy bleeding, faintness, ya tez worsening ho to turant emergency help lein.`,
      ),
      confidence: 0.92,
      escalate: true,
      followUpQuestions: [],
      grounding: ['approved plan red flags', 'symptom triage rules'],
    };
  }

  const answerParts = [
    getLocalizedText(
      language,
      `I can guide you from your recovery plan. ${buildTrendSentence(snapshot, language)}`,
      `Main aapke recovery plan ke hisaab se guide kar sakta hoon. ${buildTrendSentence(snapshot, language)}`,
    ),
    severity === 'moderate'
      ? getLocalizedText(
          language,
          'Because the symptom sounds more than mild, keep activity light today and monitor closely.',
          'Kyuki symptom mild se zyada lag raha hai, aaj activity halki rakhein aur nazar rakhein.',
        )
      : getLocalizedText(
          language,
          'If this remains mild and you do not have fever, bleeding, or breathing trouble, rest, hydrate, and reduce strain.',
          'Agar yeh mild hai aur fever, bleeding, ya breathing trouble nahi hai, to rest karein, hydrate rahein, aur strain kam karein.',
        ),
    latestPainMedicine
      ? getLocalizedText(
          language,
          `Your approved plan already includes ${latestPainMedicine.name} ${latestPainMedicine.dosage} with schedule "${latestPainMedicine.schedule}", so use only that schedule if needed.`,
          `Aapke approved plan mein ${latestPainMedicine.name} ${latestPainMedicine.dosage} aur "${latestPainMedicine.schedule}" schedule likha hai, isliye zarurat ho to usi schedule ko follow karein.`,
        )
      : '',
    buildRecommendationSentence(snapshot, language),
  ].filter(Boolean);

  const followUps = [
    getLocalizedText(language, 'Where exactly is the symptom or pain located?', 'Dard ya symptom kis jagah hai?'),
    getLocalizedText(language, 'Has it been getting better, worse, or staying the same?', 'Yeh better ho raha hai, worse ho raha hai, ya same hai?'),
    getLocalizedText(language, 'Do you also have fever, swelling, vomiting, or breathlessness?', 'Kya saath mein fever, swelling, vomiting, ya breathlessness bhi hai?'),
  ];

  return {
    answer: answerParts.join(' '),
    confidence: severity === 'moderate' ? 0.82 : 0.79,
    escalate: snapshot.latestScore?.status === 'high-risk',
    followUpQuestions: followUps,
    grounding: ['latest recovery score', 'approved symptom guidance', 'approved medication plan'],
  };
}

function buildPlanSummary(
  snapshot: PatientSnapshot,
  question: string,
  language: Language,
): VoiceQueryResponse {
  const nextFollowUp = snapshot.plan.followUps[0];
  const nextStep = snapshot.plan.dailyChecklist[0] ?? 'complete your daily check-in';
  const restrictions = snapshot.plan.activityGuidance
    .filter((item) => !item.allowed)
    .map((item) => item.action);
  const allowedFoods = snapshot.plan.dietGuidance.filter((item) => item.allowed).map((item) => item.item);

  return {
    answer: getLocalizedText(
      language,
      `${pickVariant(question, [
        'Here is the clearest summary for today.',
        'Based on your current recovery data, here is the main focus.',
        'Looking at your plan and latest check-in, this is what matters most today.',
      ])} Focus on ${nextStep}. ${buildTrendSentence(snapshot, language)} ${
        nextFollowUp ? `Your next follow-up is ${nextFollowUp.department} on ${nextFollowUp.date}.` : 'No follow-up is scheduled yet.'
      } ${
        restrictions.length > 0 ? `Still avoid ${formatList(restrictions.slice(0, 2))}.` : ''
      } ${
        allowedFoods.length > 0 ? `Foods clearly allowed include ${formatList(allowedFoods.slice(0, 2))}.` : ''
      } ${buildRecommendationSentence(snapshot, language)}`.trim(),
      `Aaj ke liye main focus ${nextStep} hai. ${buildTrendSentence(snapshot, language)} ${
        nextFollowUp ? `Agla follow-up ${nextFollowUp.department} ke saath ${nextFollowUp.date} ko hai.` : 'Abhi follow-up schedule nahi dikh raha.'
      } ${buildRecommendationSentence(snapshot, language)}`.trim(),
    ),
    confidence: 0.84,
    escalate: false,
    followUpQuestions: [],
    grounding: ['approved recovery checklist', 'latest recovery score', 'approved follow-up plan'],
  };
}

function answerVoiceQueryFallback(
  appStore: AppStore,
  input: {
    patientId: string;
    question: string;
    language: Language;
    channel: VoiceSession['channel'];
  },
): VoiceQueryResponse {
  const plan = getPatientPlan(appStore, input.patientId);
  const normalizedQuestion = normalizeText(input.question);

  let response: VoiceQueryResponse;
  if (!plan) {
    response = {
      answer: getLocalizedText(
        input.language,
        'Your doctor has not approved the recovery plan yet. Please upload the discharge document and ask your doctor to review the draft plan.',
        'Doctor ne abhi recovery plan approve nahi kiya hai. Kripaya discharge document upload karein aur doctor se draft review karwayein.',
      ),
      confidence: 0.25,
      escalate: true,
      followUpQuestions: [],
      grounding: ['doctor approval required'],
    };
  } else {
    const snapshot = buildSnapshot(appStore, input.patientId, plan);

    if (
      normalizedQuestion.includes('eat') ||
      normalizedQuestion.includes('food') ||
      normalizedQuestion.includes('diet') ||
      normalizedQuestion.includes('khana')
    ) {
      response = buildDietAnswer(snapshot, input.question, input.language);
    } else if (
      normalizedQuestion.includes('medicine') ||
      normalizedQuestion.includes('medication') ||
      normalizedQuestion.includes('tablet') ||
      normalizedQuestion.includes('dawa') ||
      normalizedQuestion.includes('dose')
    ) {
      response = buildMedicationAnswer(snapshot, input.question, input.language);
    } else if (
      normalizedQuestion.includes('follow-up') ||
      normalizedQuestion.includes('appointment') ||
      normalizedQuestion.includes('review') ||
      normalizedQuestion.includes('kab jana')
    ) {
      response = buildFollowUpAnswer(snapshot, input.language);
    } else if (
      normalizedQuestion.includes('walk') ||
      normalizedQuestion.includes('exercise') ||
      normalizedQuestion.includes('activity') ||
      normalizedQuestion.includes('stairs') ||
      normalizedQuestion.includes('bath') ||
      normalizedQuestion.includes('shower') ||
      normalizedQuestion.includes('lift')
    ) {
      response = buildActivityAnswer(snapshot, input.question, input.language);
    } else if (
      normalizedQuestion.includes('score') ||
      normalizedQuestion.includes('progress') ||
      normalizedQuestion.includes('how am i') ||
      normalizedQuestion.includes('how am i doing') ||
      normalizedQuestion.includes('recovery') ||
      normalizedQuestion.includes('am i getting better')
    ) {
      response = buildProgressAnswer(snapshot, input.language);
    } else if (
      normalizedQuestion.includes('pain') ||
      normalizedQuestion.includes('dard') ||
      normalizedQuestion.includes('not good') ||
      normalizedQuestion.includes('problem') ||
      normalizedQuestion.includes('fever') ||
      normalizedQuestion.includes('vomit') ||
      normalizedQuestion.includes('breath') ||
      normalizedQuestion.includes('swelling') ||
      normalizedQuestion.includes('bleeding') ||
      normalizedQuestion.includes('weak')
    ) {
      response = buildSymptomAnswer(snapshot, input.question, input.language);
    } else {
      response = buildPlanSummary(snapshot, input.question, input.language);
    }
  }

  return response;
}

export async function answerVoiceQuery(
  appStore: AppStore,
  input: {
    patientId: string;
    question: string;
    language: Language;
    channel: VoiceSession['channel'];
  },
): Promise<{ response: VoiceQueryResponse; session: VoiceSession }> {
  const plan = getPatientPlan(appStore, input.patientId);
  const patientUser = getPatientUser(appStore, input.patientId);

  let response: VoiceQueryResponse;
  if (!plan) {
    response = answerVoiceQueryFallback(appStore, input);
  } else {
    const modelResponse = await generateGroundedAssistantResponse({
      audience: 'patient',
      language: input.language,
      patientName: patientUser?.name ?? input.patientId,
      question: input.question,
      context: buildPatientContext(appStore, input.patientId),
    });

    response = modelResponse ?? answerVoiceQueryFallback(appStore, input);
    if (!modelResponse) {
      response = {
        ...response,
        grounding: ['fallback clinical rules', ...response.grounding],
      };
    }
  }

  const session: VoiceSession = {
    id: createId('voice'),
    patientId: input.patientId,
    language: input.language,
    channel: input.channel,
    transcript: input.question,
    reply: response.answer,
    confidence: response.confidence,
    escalated: response.escalate,
    followUpQuestions: response.followUpQuestions,
    createdAt: timestamp(),
  };

  appStore.voiceSessions.push(session);
  recordAudit(
    appStore,
    input.patientId,
    'patient',
    'voice.query',
    session.id,
    `Voice guidance issued with confidence ${response.confidence} for ${patientUser?.name ?? input.patientId}`,
  );

  persistStore(appStore);
  return { response, session };
}
