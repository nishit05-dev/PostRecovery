# AI Post-Recovery Platform MVP

This repository implements a voice-first post-discharge recovery platform starter with:

- A runnable TypeScript backend API
- Shared clinical/domain models
- A Next.js-style doctor dashboard scaffold
- A React Native patient/caregiver mobile scaffold
- Tests covering extraction, plan approval gating, scoring, alerts, dashboard ranking, and grounded voice guidance

## Workspace Layout

- `apps/api`: Runnable TypeScript HTTP API with in-memory persistence and business logic
- `apps/web`: Doctor dashboard scaffold using a Next.js App Router structure
- `apps/mobile`: React Native scaffold for patient and caregiver flows
- `packages/shared`: Shared types and curated clinical guidance rules
- `docs`: Product and architecture notes

## Run this install

```bash
npm install
```

The API starts on `http://localhost:4000`.

## Run Tests

```bash
npm test
```

## Enable Real Assistant Reasoning

The recovery assistant now supports a model-backed reasoning path for patient, caregiver, and doctor questions.

1. Copy `.env.example` to `.env.local` or `.env`
2. Set `OPENAI_API_KEY`
3. Optionally change `OPENAI_MODEL`

Without an API key, the assistant falls back to the local grounded rules engine.

## Deploy On Railway

This repo is prepared to run as a single Railway web service using the included `Dockerfile`.

Recommended Railway setup:

1. Push the repository to GitHub
2. Create a new Railway project from the GitHub repo
3. Let Railway build from the `Dockerfile`
4. Add these environment variables in Railway:
   - `OPENAI_API_KEY` if you want the paid model path
   - `OPENAI_MODEL` optional, for example `gpt-4.1-mini`
   - `OPENAI_TIMEOUT_MS` optional, for example `20000`
   - `APP_DATA_DIR=/app/data`
5. Attach a persistent volume and mount it to `/app/data`
6. Deploy and share the Railway public URL

Why the volume matters:
- The app stores persistent demo/user data in `app-store.json`
- On Railway, `APP_DATA_DIR=/app/data` makes that file live on the mounted volume instead of ephemeral container storage

## Implemented API Endpoints

- `POST /documents/upload`
- `POST /documents/:id/extract`
- `POST /patients/:id/recovery-plan/draft`
- `POST /recovery-plan/:id/approve`
- `POST /check-ins`
- `POST /voice/query`
- `GET /caregiver/alerts?caregiverId=...`
- `GET /doctor/dashboard/top-risk?doctorId=...`
- `GET /doctor/patients/:id/report?doctorId=...`
- `GET /health`

## Important Notes

- Persistent demo state is stored in `data/app-store.json`.
- The code is structured so PostgreSQL, object storage, OCR vendors, push providers, and LLM providers can be swapped in later.
- Voice processing is modeled as a hybrid on-device/cloud workflow, but device-native wake/listen code is scaffolded rather than production-integrated.
- AI guidance is grounded to approved recovery plans, uploaded documents, and curated rules. The assistant avoids diagnosis and escalates risky cases.
