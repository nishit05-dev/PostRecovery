import type { AuditEvent } from '../../../packages/shared/src/index.ts';
import { createId } from './id.ts';
import type { AppStore } from './store.ts';

function timestamp(): string {
  return new Date().toISOString();
}

export function recordAudit(
  appStore: AppStore,
  actorId: string,
  actorRole: AuditEvent['actorRole'],
  action: string,
  targetId: string,
  detail: string,
): void {
  appStore.auditEvents.push({
    id: createId('audit'),
    actorId,
    actorRole,
    action,
    targetId,
    detail,
    createdAt: timestamp(),
  });
}

