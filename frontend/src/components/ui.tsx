import { AlertTriangle, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { fmtPct } from '../format';

export function Card({ title, subtitle, actions, children, className = '' }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, swatch }: { label: string; value: ReactNode; hint?: ReactNode; swatch?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex items-start gap-1.5 text-xs leading-tight text-ink-2">
        {swatch && <span className="mt-px inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: swatch }} aria-hidden />}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Barra de progreso: relleno del acento sobre una pista del mismo tono, más clara. */
export function ProgressBar({ value, label, color = 'var(--accent)' }: { value: number | null; label: string; color?: string }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(v)}
      aria-valuetext={fmtPct(value)}
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ background: `color-mix(in srgb, ${color} 18%, var(--surface))` }}
    >
      <div className="h-full rounded-full" style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  const Icon = tone === 'warn' ? AlertTriangle : Info;
  return (
    <div
      className={`flex gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed ${
        tone === 'warn' ? 'bg-warn text-warn-ink' : 'bg-surface-2 text-ink-2'
      }`}
    >
      <Icon size={14} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'accent' }) {
  const cls =
    tone === 'warn'
      ? 'bg-warn text-warn-ink'
      : tone === 'accent'
        ? 'bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))] text-ink'
        : 'bg-surface-2 text-ink-2';
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

/** Valor que no puede calcularse: se muestra como "No calculable" con su motivo. */
export function NotComputable({ reason }: { reason: string | null }) {
  return (
    <span className="text-base font-medium text-ink-2" title={reason ?? undefined}>
      No calculable
    </span>
  );
}

export function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />;
}

export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">{children}</div>;
}
