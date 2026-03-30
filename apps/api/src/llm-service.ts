import type { Language, VoiceQueryResponse } from '../../../packages/shared/src/index.ts';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 20000);

type AssistantAudience = 'patient' | 'caregiver' | 'doctor';

type GroundedAssistantInput = {
  audience: AssistantAudience;
  language: Language;
  patientName: string;
  question: string;
  context: string;
};

type OpenAiAssistantPayload = {
  answer: string;
  confidence: number;
  escalate: boolean;
  followUpQuestions: string[];
  grounding: string[];
};

function getModelName(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
}

export function hasRealtimeAssistantModel(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.55;
  }
  return Math.max(0, Math.min(1, value));
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of payload?.output ?? []) {
    if (item?.type !== 'message') {
      continue;
    }
    for (const content of item.content ?? []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join('\n').trim();
}

function coerceModelResponse(raw: unknown): VoiceQueryResponse | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const value = raw as Partial<OpenAiAssistantPayload>;
  if (typeof value.answer !== 'string' || !value.answer.trim()) {
    return null;
  }

  return {
    answer: value.answer.trim(),
    confidence: normalizeConfidence(value.confidence),
    escalate: Boolean(value.escalate),
    followUpQuestions: Array.isArray(value.followUpQuestions)
      ? value.followUpQuestions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    grounding: Array.isArray(value.grounding)
      ? value.grounding.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
  };
}

function buildDeveloperPrompt(input: GroundedAssistantInput): string {
  const audienceLabel =
    input.audience === 'patient'
      ? 'a recovering patient'
      : input.audience === 'caregiver'
        ? 'a caregiver monitoring the patient'
        : 'a doctor monitoring the patient';

  return [
    `You are a post-discharge healthcare assistant speaking to ${audienceLabel}.`,
    'Use only the grounded patient context provided by the application plus ordinary language understanding.',
    'Do not invent medication names, food permissions, appointments, or diagnoses that are not supported by context.',
    'If context is incomplete or the question is clinically risky, be explicit that you are uncertain and set escalate to true.',
    'Do not claim emergency escalation was already sent unless the app context says so.',
    'Keep the answer warm, practical, and direct.',
    input.language === 'hi'
      ? 'Reply in simple Hindi unless a medicine or department name should remain in English.'
      : 'Reply in simple English.',
    'Return only JSON matching the schema.',
  ].join(' ');
}

function buildUserPrompt(input: GroundedAssistantInput): string {
  return [
    `Patient name: ${input.patientName}`,
    `Audience: ${input.audience}`,
    `Preferred language: ${input.language}`,
    '',
    'Grounded patient context:',
    input.context,
    '',
    `User question: ${input.question}`,
  ].join('\n');
}

export async function generateGroundedAssistantResponse(
  input: GroundedAssistantInput,
): Promise<VoiceQueryResponse | null> {
  if (!hasRealtimeAssistantModel()) {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getModelName(),
        input: [
          {
            role: 'developer',
            content: [
              {
                type: 'input_text',
                text: buildDeveloperPrompt(input),
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: buildUserPrompt(input),
              },
            ],
          },
        ],
        max_output_tokens: 500,
        text: {
          format: {
            type: 'json_schema',
            name: 'grounded_voice_response',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                answer: { type: 'string' },
                confidence: { type: 'number' },
                escalate: { type: 'boolean' },
                followUpQuestions: {
                  type: 'array',
                  items: { type: 'string' },
                },
                grounding: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['answer', 'confidence', 'escalate', 'followUpQuestions', 'grounding'],
            },
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const outputText = extractOutputText(payload);
    if (!outputText) {
      return null;
    }

    const parsed = JSON.parse(outputText) as unknown;
    const result = coerceModelResponse(parsed);
    if (!result) {
      return null;
    }

    result.grounding = ['model-grounded reasoning', ...result.grounding];
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
