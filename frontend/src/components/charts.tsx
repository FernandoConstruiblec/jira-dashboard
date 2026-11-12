import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CATEGORY_LABEL, type AnyCategory, type CategoryCounts } from '../domain/categories';
import { fmtInt, fmtPct } from '../format';
import { CATEGORY_COLOR } from '../theme';
import { Swatch } from './ui';

// --- Leyenda y tooltip compartidos -----------------------------------------

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <Swatch color={i.color} />
          <span>{i.label}</span>
          {i.value && <span className="tabular text-ink">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

type Row = Record<string, unknown>;

/** Lo mínimo que Recharts entrega al contenido del tooltip. */
interface TooltipEntry {
  dataKey?: unknown;
  name?: unknown;
  value?: unknown;
  color?: string;
  payload?: Row & { fill?: string };
}
interface TooltipProps {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: unknown;
}

/** Tooltip: el valor manda y el nombre de la serie acompaña; clave de serie como trazo. */
function ChartTooltip({
  active,
  payload,
  label,
  format,
  title,
}: TooltipProps & { format: (v: number, key: string, row: Row) => string; title?: (row: Row) => string }) {
  if (!active || !payload?.length) return null;
  const row = (payload[0].payload ?? {}) as Row;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium text-ink">{title ? title(row) : String(label ?? '')}</div>
      <ul className="space-y-0.5">
        {payload
          .filter((p) => p.value !== undefined && p.value !== null)
          .map((p) => (
            <li key={String(p.dataKey)} className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: String(p.color ?? p.payload?.fill) }} aria-hidden />
              <span className="tabular font-semibold text-ink">{format(Number(p.value), String(p.dataKey), row)}</span>
              <span className="text-ink-2">{String(p.name)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

// --- Dona de estados -------------------------------------------------------

export function StatusDonut({ counts, categories, centerLabel = 'actividades' }: {
  counts: CategoryCounts;
  categories: AnyCategory[];
  centerLabel?: string;
}) {
  const total = categories.reduce((a, c) => a + counts[c], 0);
  const data = categories.map((c) => ({ key: c, name: CATEGORY_LABEL[c], value: counts[c] })).filter((d) => d.value > 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="64%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={CATEGORY_COLOR[d.key]} />
              ))}
            </Pie>
            <Tooltip
              content={(p) => (
                <ChartTooltip
                  {...p}
                  title={(row) => String(row.name)}
                  format={(v) => `${fmtInt(v)} · ${fmtPct(total ? (v / total) * 100 : null)}`}
                />
              )}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-ink">{fmtInt(total)}</span>
          <span className="text-xs text-ink-2">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {categories.map((c) => (
          <li key={c} className="flex items-center gap-2">
            <Swatch color={CATEGORY_COLOR[c]} />
            <span className="flex-1 text-ink-2">{CATEGORY_LABEL[c]}</span>
            <span className="tabular font-medium text-ink">{fmtInt(counts[c])}</span>
            <span className="tabular w-14 text-right text-xs text-muted">{fmtPct(total ? (counts[c] / total) * 100 : null)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Barras apiladas por estado --------------------------------------------

export function StatusStackedBars({ rows, categories, labelWidth = 120 }: {
  rows: { id: string; label: string; counts: CategoryCounts }[];
  categories: AnyCategory[];
  labelWidth?: number;
}) {
  const data = rows.map((r) => ({ id: r.id, label: r.label, ...Object.fromEntries(categories.map((c) => [c, r.counts[c]])) }));
  const height = Math.max(80, rows.length * 32 + 24);
  return (
    <div className="space-y-3">
      <Legend items={categories.map((c) => ({ label: CATEGORY_LABEL[c], color: CATEGORY_COLOR[c] }))} />
      <div style={{ height }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={8}>
            <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" width={labelWidth} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  format={(v, _k, row) => {
                    const total = categories.reduce((a, c) => a + Number(row[c] ?? 0), 0);
                    return `${fmtInt(v)} (${fmtPct(total ? (v / total) * 100 : null)})`;
                  }}
                />
              )}
            />
            {categories.map((c) => (
              <Bar
                key={c}
                dataKey={c}
                name={CATEGORY_LABEL[c]}
                stackId="estado"
                fill={CATEGORY_COLOR[c]}
                stroke="var(--surface)"
                strokeWidth={2}
                maxBarSize={20}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// --- Barras de porcentaje ---------------------------------------------------

/** Un porcentaje por fila; cada barra lleva el color de su entidad y el valor en la punta. */
export function PercentBars({ rows, labelWidth = 120, seriesName = 'Avance' }: {
  rows: { id: string; label: string; value: number | null; color: string; detail?: string }[];
  labelWidth?: number;
  seriesName?: string;
}) {
  const data = rows.map((r) => ({ ...r, value: r.value ?? 0, missing: r.value === null }));
  const height = Math.max(64, rows.length * 32 + 24);
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={labelWidth} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={(p) => (
              <ChartTooltip
                {...p}
                format={(v, _k, row) => (row.missing ? 'No calculable' : `${fmtPct(v)}${row.detail ? ` · ${row.detail}` : ''}`)}
              />
            )}
          />
          <Bar dataKey="value" name={seriesName} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.id} fill={d.color} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              content={(props) => {
                const { x, y, width, height: h, index } = props as { x: number; y: number; width: number; height: number; index: number };
                const d = data[index];
                return (
                  <text x={x + width + 6} y={y + h / 2} dominantBaseline="central" fontSize={11} fill="var(--ink-2)" className="tabular">
                    {d.missing ? 'No calculable' : fmtPct(d.value)}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Barras agrupadas por serie --------------------------------------------

/**
 * Varias métricas (filas) comparadas entre series (p. ej. proyectos).
 * `unit` decide el eje: porcentaje (0–100) o cantidad.
 */
export function GroupedBars({ rows, series, unit, labelWidth = 150 }: {
  rows: { id: string; label: string; values: Record<string, number | null> }[];
  series: { key: string; label: string; color: string }[];
  unit: 'pct' | 'count';
  labelWidth?: number;
}) {
  const data = rows.map((r) => ({ id: r.id, label: r.label, ...Object.fromEntries(series.map((s) => [s.key, r.values[s.key] ?? 0])), raw: r.values }));
  const height = Math.max(96, rows.length * (series.length * 22 + 18) + 24);
  const fmt = (v: number) => (unit === 'pct' ? fmtPct(v) : fmtInt(v));
  return (
    <div className="space-y-3">
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      <div style={{ height }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={12} barGap={2}>
            <XAxis
              type="number"
              domain={unit === 'pct' ? [0, 100] : [0, 'auto']}
              ticks={unit === 'pct' ? [0, 25, 50, 75, 100] : undefined}
              allowDecimals={false}
              tickFormatter={(v) => (unit === 'pct' ? `${v}%` : fmtInt(v))}
              axisLine={false}
              tickLine={false}
            />
            <YAxis type="category" dataKey="label" width={labelWidth} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  format={(v, key, row) => ((row.raw as Record<string, number | null>)[key] === null ? 'No calculable' : fmt(v))}
                />
              )}
            />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
                <LabelList
                  dataKey={s.key}
                  position="right"
                  content={(props) => {
                    const { x, y, width, height: h, index } = props as { x: number; y: number; width: number; height: number; index: number };
                    const raw = (data[index].raw as Record<string, number | null>)[s.key];
                    return (
                      <text x={x + width + 6} y={y + h / 2} dominantBaseline="central" fontSize={11} fill="var(--ink-2)">
                        {raw === null || raw === undefined ? '—' : fmt(raw)}
                      </text>
                    );
                  }}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
