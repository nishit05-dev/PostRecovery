# Architecture Notes

## System Shape

- `apps/mobile` is the patient and caregiver experience.
- `apps/web` is the doctor dashboard.
- `apps/api` owns document ingestion, extraction, care-plan drafting, scoring, alerts, and grounded voice response logic.
- `packages/shared` holds domain contracts so all surfaces stay aligned.

## Clinical Safety Defaults

- AI-generated plans must be approved by a doctor before they become patient-facing truth.
- Voice answers are grounded only in approved plan data, uploaded documents, and curated rules.
- Red-flag symptoms escalate immediately even if the numeric score is still high.
- Caregiver is the first alert recipient for amber deterioration; doctor joins automatically for severe deterioration.

## Planned Infrastructure Upgrades

- Replace in-memory arrays with PostgreSQL plus encrypted object storage.
- Replace text upload with OCR jobs connected to PDFs, images, or hospital exports.
- Add push notifications, audit retention, SSE/WebSocket live updates, and access-token auth.
- Integrate a multilingual speech stack for English and Hindi voice interaction.

