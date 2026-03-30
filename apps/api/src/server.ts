import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { approveRecoveryPlan, extractClinicalData, generateRecoveryPlanDraft, uploadDocument } from './document-service.ts';
import { getCaregiverAlerts, getDoctorPatientReport, getDoctorTopRisk } from './doctor-service.ts';
import { submitCheckIn } from './monitoring-service.ts';
import { store } from './store.ts';
import { answerVoiceQuery } from './voice-service.ts';

const port = Number(process.env.PORT ?? 4000);

function setJsonHeaders(response: ServerResponse): void {
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  setJsonHeaders(response);
  response.statusCode = statusCode;
  response.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody(request: IncomingMessage): Promise<any> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (method === 'OPTIONS') {
      setJsonHeaders(response);
      response.statusCode = 204;
      response.end();
      return;
    }

    if (method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, {
        status: 'ok',
        patients: store.patients.length,
        documents: store.documents.length,
        plans: store.recoveryPlans.length,
        alerts: store.alerts.length,
      });
      return;
    }

    if (method === 'POST' && url.pathname === '/documents/upload') {
      const body = await readJsonBody(request);
      const document = uploadDocument(store, body);
      sendJson(response, 201, document);
      return;
    }

    const extractMatch = url.pathname.match(/^\/documents\/([^/]+)\/extract$/);
    if (method === 'POST' && extractMatch) {
      const extracted = extractClinicalData(store, extractMatch[1]);
      sendJson(response, 200, extracted);
      return;
    }

    const draftMatch = url.pathname.match(/^\/patients\/([^/]+)\/recovery-plan\/draft$/);
    if (method === 'POST' && draftMatch) {
      const draft = generateRecoveryPlanDraft(store, draftMatch[1]);
      sendJson(response, 201, draft);
      return;
    }

    const approveMatch = url.pathname.match(/^\/recovery-plan\/([^/]+)\/approve$/);
    if (method === 'POST' && approveMatch) {
      const body = await readJsonBody(request);
      const approvedPlan = approveRecoveryPlan(store, approveMatch[1], body.doctorId);
      sendJson(response, 200, approvedPlan);
      return;
    }

    if (method === 'POST' && url.pathname === '/check-ins') {
      const body = await readJsonBody(request);
      const result = submitCheckIn(store, body);
      sendJson(response, 201, result);
      return;
    }

    if (method === 'POST' && url.pathname === '/voice/query') {
      const body = await readJsonBody(request);
      const result = await answerVoiceQuery(store, {
        patientId: body.patientId,
        question: body.question,
        language: body.language ?? 'en',
        channel: body.channel ?? 'continuous-listening',
      });
      sendJson(response, 200, result);
      return;
    }

    if (method === 'GET' && url.pathname === '/caregiver/alerts') {
      const caregiverId = url.searchParams.get('caregiverId');
      if (!caregiverId) {
        throw new Error('Missing caregiverId query parameter');
      }
      sendJson(response, 200, getCaregiverAlerts(store, caregiverId));
      return;
    }

    if (method === 'GET' && url.pathname === '/doctor/dashboard/top-risk') {
      const doctorId = url.searchParams.get('doctorId');
      if (!doctorId) {
        throw new Error('Missing doctorId query parameter');
      }
      sendJson(response, 200, getDoctorTopRisk(store, doctorId));
      return;
    }

    const reportMatch = url.pathname.match(/^\/doctor\/patients\/([^/]+)\/report$/);
    if (method === 'GET' && reportMatch) {
      const doctorId = url.searchParams.get('doctorId');
      if (!doctorId) {
        throw new Error('Missing doctorId query parameter');
      }
      sendJson(response, 200, getDoctorPatientReport(store, doctorId, reportMatch[1]));
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    sendJson(response, 400, { error: message });
  }
});

server.listen(port, () => {
  console.log(`Post-recovery API listening on http://localhost:${port}`);
});
