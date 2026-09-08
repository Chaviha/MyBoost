export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-6">
      {eyebrow ? (
        <p className="mb-1 text-xs font-medium tracking-[0.14em] text-forest uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="font-display text-3xl leading-tight font-medium tracking-tight text-balance">
        {title}
      </h1>
      {subtitle ? <p className="mt-1.5 max-w-xl text-sm text-ink-muted text-pretty">{subtitle}</p> : null}
    </header>
  );
}
