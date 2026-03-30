import type { Language } from './types.ts';

export interface CuratedFoodRule {
  item: string;
  guidance: string;
  hindiGuidance: string;
}

export const curatedFoodRules: CuratedFoodRule[] = [
  {
    item: 'papaya',
    guidance:
      'Papaya is usually acceptable after discharge if the doctor has not restricted it and the patient is not having vomiting or loose stools.',
    hindiGuidance:
      'अगर डॉक्टर ने मना नहीं किया है और उल्टी या दस्त नहीं हैं, तो पपीता आम तौर पर लिया जा सकता है।',
  },
  {
    item: 'spicy food',
    guidance:
      'Spicy food should be avoided when discharge notes mention gastritis, abdominal surgery, loose stools, or nausea.',
    hindiGuidance:
      'अगर पेट की सर्जरी, गैस्ट्राइटिस, दस्त या मतली हो तो मसालेदार खाना नहीं लेना चाहिए।',
  },
  {
    item: 'milk',
    guidance:
      'Milk is acceptable unless there is lactose intolerance, nausea, or a specific restriction in the recovery plan.',
    hindiGuidance:
      'अगर लैक्टोज असहिष्णुता, मतली या खास मना नहीं है, तो दूध लिया जा सकता है।',
  },
  {
    item: 'rice',
    guidance:
      'Soft rice is often acceptable after discharge when the plan recommends light meals.',
    hindiGuidance:
      'अगर हल्का भोजन सुझाया गया है, तो नरम चावल अक्सर लिया जा सकता है।',
  },
];

export const redFlagSymptomKeywords = [
  'chest pain',
  'difficulty breathing',
  'shortness of breath',
  'fainting',
  'heavy bleeding',
  'confusion',
  'severe pain',
  'uncontrolled vomiting',
  'oxygen drop',
  'high fever',
];

export function getLocalizedText(
  language: Language,
  english: string,
  hindi: string,
): string {
  return language === 'hi' ? hindi : english;
}

export function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

