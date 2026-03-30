export const patientSnapshot = {
  patientName: 'Riya Sen',
  diagnosis: 'Appendectomy recovery',
  approvedPlan: true,
  language: 'English / Hindi',
  meds: ['Paracetamol 500mg twice daily', 'Amoxicillin 250mg three times daily'],
  checklist: [
    'Take medicines after meals',
    'Avoid spicy food',
    'Walk slowly for 10 minutes',
    'Complete daily check-in tonight',
  ],
  followUps: ['Surgery review on 2026-04-05'],
  alerts: ['Caregiver will be notified if recovery score falls below 75'],
};

export const caregiverSnapshot = {
  patientName: 'Riya Sen',
  latestScore: 66,
  latestSymptoms: 'Body pain (4/10), reduced appetite',
  lastAlert: 'Amber alert sent for low appetite and missed medication window',
};

