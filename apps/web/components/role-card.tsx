import Link from 'next/link';

export function RoleCard({
  title,
  href,
  metric,
  description,
}: {
  title: string;
  href: string;
  metric: string;
  description: string;
}) {
  return (
    <Link href={href} className="linkCard stack">
      <div className="row">
        <span className="metric">{metric}</span>
        <span className="pill">Ready</span>
      </div>
      <strong>{title}</strong>
      <span className="muted">{description}</span>
      <span className="cta">Open workspace</span>
    </Link>
  );
}
