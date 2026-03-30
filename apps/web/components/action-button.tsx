'use client';

import { useFormStatus } from 'react-dom';

export function ActionButton({
  label,
  pendingLabel,
  tone = 'primary',
}: {
  label: string;
  pendingLabel?: string;
  tone?: 'primary' | 'ghost';
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={tone === 'ghost' ? 'ghostButton' : 'actionButton'}
      disabled={pending}
    >
      {pending ? pendingLabel ?? 'Working...' : label}
    </button>
  );
}

