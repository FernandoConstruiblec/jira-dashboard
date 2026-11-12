import { Link } from 'react-router-dom';
import { GroupedBars, StatusDonut } from '../components/charts';
import { FilterBar } from '../components/FilterBar';
import { IssueLink } from '../components/IssueLink';
import { Badge, Card, Kpi, Notice, NotComputable, ProgressBar, Swatch, TableScroll } from '../components/ui';
import { useFilters } from '../data';
import { CATEGORY_LABEL, visibleCategories } from '../domain/categories';
import { formatDate } from '../domain/dates';
import { epicRows, overview, projectRows, type EpicRow } from '../domain/metrics';
import type { Model } from '../domain/model';
import { fmtDec, fmtInt, fmtPct, plural } from '../format';
import { CATEGORY_COLOR, projectColor } from '../theme';

function ProjectTabs({ model }: { model: Model }) {
  const { filters, update } = useFilters();
  const tabs = [{ key: null as string | null, label: 'Consolidado' }, ...model.projects.map((p) => ({ key: p.key, label: p.label }))];
  return (
    <div role="tablist" aria-label="Proyecto" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {tabs.map((t) => {
        const selected = filters.project === t.key;
        return (
          <button
            key={t.label}
            role="tab"
            aria-selected={selected}
            onClick={() => update({ project: t.key, sprint: null, epic: null })}
            className={`rounded-md px-3 py-1.5 text-sm ${selected ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

const STATE_BADGE: Record<EpicRow['state'], { label: string; tone: 'neutral' | 'warn' | 'accent' }> = {
  ok: { label: 'Ponderado', tone: 'neutral' },
  'sin-duracion': { label: 'Sin duración planificada', tone: 'warn' },
  'pendiente-descomposicion': { label: 'Pendiente de descomposición', tone: 'warn' },
};

const DURATION_ISSUE: Record<string, string> = {
  'sin-fechas': 'sin fechas',
  'solo-inicio': 'falta vencimiento',
  'solo-fin': 'falta inicio',
  'fechas-invertidas': 'vencimiento anterior al inicio',
};

export function GlobalView({ model }: { model: Model }) {
  const { filters } = useFilters();
  const o = overview(model, filters);
  const projects = projectRows(model, filters);
  const epics = epicRows(model, filters);
  const categories = visibleCategories([o.counts], model.config);
  const scopeLabel = filters.project ? model.projects.find((p) => p.key === filters.project)?.label : 'ambos proyectos';
  const durationUnit = model.config.duration.mode === 'businessDays' ? 'días hábiles' : 'días';
  const w = o.weighted;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProjectTabs model={model} />
        <p className="text-xs text-ink-2">
          Unidad de conteo: subtareas cuando existen; si no, la historia, tarea o error. Los épicos no se cuentan.
        </p>
      </div>
      <FilterBar model={model} hide={['project']} />

      {/* Indicadores principales -------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Avance ponderado por duración"
          subtitle={`Trabajo completado sobre la duración planificada de los épicos de ${scopeLabel}.`}
          actions={<Badge tone="accent">Ponderación provisional</Badge>}
        >
          <div className="mb-3 text-5xl font-semibold text-ink">{w.pct === null ? <NotComputable reason={w.reason} /> : fmtPct(w.pct)}</div>
          <ProgressBar value={w.pct} label="Avance ponderado" />
          <div className="mt-3 space-y-2">
            {w.pct === null && w.reason && <Notice tone="warn">{w.reason}</Notice>}
            {w.pct !== null && (
              <p className="text-xs text-ink-2">
                {fmtDec(w.completedWeight)} de {fmtDec(w.totalWeight)} {durationUnit} ponderados, en{' '}
                {plural(w.epicsCounted, 'épico', 'épicos')}. Cada épico reparte su duración en partes iguales entre sus
                actividades porque no hay estimaciones individuales.
              </p>
            )}
            {w.epicsWithoutDuration.length > 0 && (
              <Notice tone="warn">
                {plural(w.epicsWithoutDuration.length, 'épico queda', 'épicos quedan')} fuera del avance ponderado por no
                tener fecha de inicio y de vencimiento:{' '}
                {w.epicsWithoutDuration.map((e) => e.key).join(', ')}.
              </Notice>
            )}
            {w.epicsPendingDecomposition.length > 0 && !filters.person && filters.sprint === null && (
              <Notice>
                {plural(w.epicsPendingDecomposition.length, 'épico aún no tiene', 'épicos aún no tienen')} historias ni
                subtareas; su duración cuenta con 0 % de avance:{' '}
                {w.epicsPendingDecomposition.map((e) => e.key).join(', ')}.
              </Notice>
            )}
            {w.unitsWithoutEpic > 0 && (
              <Notice>
                {w.unitsWithoutEpic === 1
                  ? '1 actividad sin épico se cuenta en las cantidades, pero no tiene peso de duración.'
                  : `${fmtInt(w.unitsWithoutEpic)} actividades sin épico se cuentan en las cantidades, pero no tienen peso de duración.`}
              </Notice>
            )}
          </div>
        </Card>

        <Card title="Actividades completadas" subtitle="Proporción por cantidad, sin ponderar. No es equivalente al avance ponderado.">
          <div className="mb-3 text-5xl font-semibold text-ink">
            {o.completedPct === null ? <NotComputable reason="No hay actividades en la selección." /> : fmtPct(o.completedPct)}
          </div>
          <ProgressBar value={o.completedPct} label="Actividades completadas" color="var(--cat-completada)" />
          <p className="mt-3 text-xs text-ink-2">
            {fmtInt(o.completed)} de {fmtInt(o.total)} actividades en estado final (Hecho/Listo/Finalizada).
          </p>
          {filters.category && (
            <div className="mt-2">
              <Notice>Filtrando por «{CATEGORY_LABEL[filters.category]}»: los porcentajes describen solo esa selección.</Notice>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Kpi label="Actividades" value={fmtInt(o.total)} hint={scopeLabel} />
        {categories.map((c) => (
          <Kpi
            key={c}
            label={c === 'POR_HACER' ? 'Pendientes (por hacer)' : CATEGORY_LABEL[c]}
            value={fmtInt(o.counts[c])}
            swatch={CATEGORY_COLOR[c]}
            hint={fmtPct(o.total ? (o.counts[c] / o.total) * 100 : null)}
          />
        ))}
      </div>

      {/* Distribución y comparación ----------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Distribución por estado" subtitle={`Estado actual de las actividades de ${scopeLabel}.`}>
          <StatusDonut counts={o.counts} categories={categories} />
        </Card>
        <Card
          title={filters.project ? `Avance de ${scopeLabel}` : 'KMS frente a Prototipo'}
          subtitle="Avance ponderado y porcentaje de actividades completadas por proyecto."
        >
          <GroupedBars
            unit="pct"
            series={projects.map((p) => ({ key: p.key, label: p.label, color: projectColor(p.key) }))}
            rows={[
              { id: 'w', label: 'Avance ponderado', values: Object.fromEntries(projects.map((p) => [p.key, p.weighted.pct])) },
              { id: 'c', label: 'Actividades completadas', values: Object.fromEntries(projects.map((p) => [p.key, p.completedPct])) },
            ]}
          />
        </Card>
      </div>

      <Card title="Resumen por proyecto">
        <TableScroll>
          <table className="data-table">
            <thead>
              <tr>
                <th>Proyecto</th>
                <th className="num">Actividades</th>
                <th className="num">Completadas</th>
                <th className="num">No completadas</th>
                <th className="num">% completadas</th>
                <th className="num">Avance ponderado</th>
                <th className="num">Épicos sin duración</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.key}>
                  <td>
                    <span className="flex items-center gap-2">
                      <Swatch color={projectColor(p.key)} />
                      {p.label} <span className="text-muted">({p.key})</span>
                    </span>
                  </td>
                  <td className="num">{fmtInt(p.total)}</td>
                  <td className="num">{fmtInt(p.completed)}</td>
                  <td className="num">{fmtInt(p.total - p.completed)}</td>
                  <td className="num">{fmtPct(p.completedPct)}</td>
                  <td className="num" title={p.weighted.reason ?? undefined}>
                    {p.weighted.pct === null ? 'No calculable' : fmtPct(p.weighted.pct)}
                  </td>
                  <td className="num">{fmtInt(p.weighted.epicsWithoutDuration.length)}</td>
                </tr>
              ))}
              {projects.length > 1 && (
                <tr className="font-medium">
                  <td>Consolidado</td>
                  <td className="num">{fmtInt(o.total)}</td>
                  <td className="num">{fmtInt(o.completed)}</td>
                  <td className="num">{fmtInt(o.total - o.completed)}</td>
                  <td className="num">{fmtPct(o.completedPct)}</td>
                  <td className="num">{w.pct === null ? 'No calculable' : fmtPct(w.pct)}</td>
                  <td className="num">{fmtInt(w.epicsWithoutDuration.length)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <Card
        title="Épicos"
        subtitle={`La duración (${durationUnit}, inicio y fin incluidos) es el peso del épico en el avance ponderado.`}
      >
        <TableScroll>
          <table className="data-table">
            <thead>
              <tr>
                <th>Épico</th>
                <th>Proyecto</th>
                <th>Inicio</th>
                <th>Vencimiento</th>
                <th className="num">Duración</th>
                <th className="num">Actividades</th>
                <th className="num">Completadas</th>
                <th className="num">% completadas</th>
                <th>Ponderación</th>
              </tr>
            </thead>
            <tbody>
              {epics.map((r) => (
                <tr key={r.epic.key}>
                  <td className="min-w-[16rem]">
                    <IssueLink model={model} issueKey={r.epic.key} /> <span className="text-ink-2">{r.epic.summary}</span>
                  </td>
                  <td>{r.label}</td>
                  <td className="whitespace-nowrap">{formatDate(r.epic.startDate)}</td>
                  <td className="whitespace-nowrap">{formatDate(r.epic.dueDate)}</td>
                  <td className="num whitespace-nowrap" title={r.epic.durationIssue ? DURATION_ISSUE[r.epic.durationIssue] : undefined}>
                    {r.epic.duration === null ? <span className="text-muted">{DURATION_ISSUE[r.epic.durationIssue ?? 'sin-fechas']}</span> : fmtInt(r.epic.duration)}
                  </td>
                  <td className="num">{fmtInt(r.units)}</td>
                  <td className="num">{fmtInt(r.completed)}</td>
                  <td className="num">{fmtPct(r.completedPct)}</td>
                  <td>
                    <Badge tone={STATE_BADGE[r.state].tone}>{STATE_BADGE[r.state].label}</Badge>
                  </td>
                </tr>
              ))}
              {epics.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-ink-2">
                    No hay épicos en la selección.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <p className="text-xs text-muted">
        Fuera del dashboard por configuración: {plural(model.excluded.epics, 'épico', 'épicos')},{' '}
        {plural(model.excluded.sprints, 'sprint', 'sprints')} y {plural(model.excluded.issues, 'incidencia', 'incidencias')}.{' '}
        <Link to="/configuracion" className="text-accent hover:underline">
          Ver configuración
        </Link>
      </p>
    </div>
  );
}
