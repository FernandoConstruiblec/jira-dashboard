import { useMemo } from 'react';
import { PercentBars, StatusStackedBars } from '../components/charts';
import { FilterBar } from '../components/FilterBar';
import { IssueLink } from '../components/IssueLink';
import { Badge, Card, Kpi, Notice, Swatch, TableScroll } from '../components/ui';
import { useFilters } from '../data';
import { CATEGORY_LABEL, visibleCategories, type AnyCategory } from '../domain/categories';
import { formatDate, formatDateTime } from '../domain/dates';
import { unitMatches } from '../domain/filters';
import type { Model, SprintInfo } from '../domain/model';
import { projectSprintSummaries, sprintMetrics, type SprintMetrics, type SprintUnit } from '../domain/sprints';
import { fmtInt, fmtPct, plural } from '../format';
import { CATEGORY_COLOR, projectColor } from '../theme';

const STATE_LABEL: Record<SprintInfo['state'], string> = { active: 'Activo', closed: 'Cerrado', future: 'Futuro' };
const JOIN_LABEL: Record<SprintUnit['join'], string> = {
  comprometida: 'Comprometida al inicio',
  arrastrada: 'Arrastrada del sprint anterior',
  agregada: 'Agregada después del inicio',
};

const sprintLabel = (s: SprintInfo, both: boolean) => (both ? `${s.projectLabel} · ${s.name}` : s.name);

export function SprintsView({ model }: { model: Model }) {
  const { filters, params, setParams } = useFilters();
  const both = !filters.project;

  const metrics = useMemo(() => {
    const include = (u: Parameters<typeof unitMatches>[0]) => unitMatches(u, filters, ['sprint', 'category']);
    return model.sprints
      .filter((s) => !filters.project || s.projectKey === filters.project)
      .map((s) => sprintMetrics(model, s, include));
  }, [model, filters]);

  const executed = metrics.filter((m) => m.sprint.state !== 'future');
  const categories = visibleCategories(executed.map((m) => m.counts), model.config);
  const summaries = projectSprintSummaries(model, metrics).filter((s) => !filters.project || s.projectKey === filters.project);

  const detailId = Number(params.get('detalle'));
  const detail = metrics.find((m) => m.sprint.id === detailId) ?? metrics.find((m) => m.sprint.state === 'active') ?? executed.at(-1);
  const select = (id: number) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('detalle', String(id));
        return n;
      },
      { replace: true },
    );

  const chartRows = executed.slice().reverse();

  return (
    <div className="space-y-4">
      <FilterBar model={model} hide={['sprint', 'category']} />

      {!model.history && (
        <Notice tone="warn">
          No se pudo leer el historial de Jira{model.historyInfo.error ? ` (${model.historyInfo.error})` : ''}. Las cifras de
          sprints cerrados son aproximadas: se usa el sprint actual de cada actividad y no se distinguen las retiradas; el
          estado al cierre solo se conoce si no cambió después.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaries.map((s) => (
          <Kpi
            key={s.projectKey}
            swatch={projectColor(s.projectKey)}
            label={`${s.label}: avance promedio de sprints cerrados`}
            value={fmtPct(s.avgPct)}
            hint={`${plural(s.closedSprints, 'sprint cerrado', 'sprints cerrados')} · agregado ${fmtPct(s.pooledPct)}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Estado de las actividades por sprint" subtitle="Al cierre en sprints cerrados; estado actual en el sprint activo.">
          {chartRows.length ? (
            <StatusStackedBars
              labelWidth={both ? 170 : 130}
              categories={categories}
              rows={chartRows.map((m) => ({ id: String(m.sprint.id), label: sprintLabel(m.sprint, both), counts: m.counts }))}
            />
          ) : (
            <p className="text-sm text-ink-2">No hay sprints iniciados en la selección.</p>
          )}
        </Card>
        <Card
          title={both ? 'Cumplimiento por sprint: KMS frente a Prototipo' : 'Cumplimiento por sprint'}
          subtitle="Avance = completadas / alcance del sprint. El color identifica el proyecto."
        >
          {both && (
            <ul className="mb-3 flex gap-4 text-xs text-ink-2">
              {model.projects.map((p) => (
                <li key={p.key} className="flex items-center gap-1.5">
                  <Swatch color={projectColor(p.key)} /> {p.label}
                </li>
              ))}
            </ul>
          )}
          <PercentBars
            labelWidth={both ? 170 : 130}
            rows={chartRows.map((m) => ({
              id: String(m.sprint.id),
              label: sprintLabel(m.sprint, both),
              value: m.pct,
              color: projectColor(m.sprint.projectKey),
              detail: `${m.completed} de ${m.total}`,
            }))}
          />
        </Card>
      </div>

      <Card title="Comparativo de sprints" subtitle="Selecciona un sprint para ver su detalle.">
        <TableScroll>
          <table className="data-table">
            <thead>
              <tr>
                <th>Sprint</th>
                <th>Proyecto</th>
                <th>Estado</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th className="num" title="Comprometidas al inicio">Comprom.</th>
                <th className="num" title="Arrastradas del sprint anterior">Arrastr.</th>
                <th className="num" title="Agregadas después del inicio">Agreg.</th>
                <th className="num" title="Retiradas o trasladadas durante el sprint">Retir.</th>
                <th className="num">Alcance</th>
                {categories.map((c) => (
                  <th key={c} className="num">
                    {CATEGORY_LABEL[c]}
                  </th>
                ))}
                <th className="num">Avance</th>
                <th className="num" title="Completadas de lo comprometido (comprometidas + arrastradas)">Cumpl. compromiso</th>
              </tr>
            </thead>
            <tbody>
              {metrics
                .slice()
                .reverse()
                .map((m) => (
                  <tr
                    key={m.sprint.id}
                    onClick={() => select(m.sprint.id)}
                    className={`cursor-pointer ${detail?.sprint.id === m.sprint.id ? 'bg-surface-2' : ''}`}
                  >
                    <td className="whitespace-nowrap">
                      <button type="button" className="text-left text-accent hover:underline" onClick={() => select(m.sprint.id)}>
                        {m.sprint.name}
                      </button>
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <Swatch color={projectColor(m.sprint.projectKey)} />
                        {m.sprint.projectLabel}
                      </span>
                    </td>
                    <td>{STATE_LABEL[m.sprint.state]}</td>
                    <td className="whitespace-nowrap">{formatDate(m.sprint.startDate)}</td>
                    <td className="whitespace-nowrap">{formatDate(m.sprint.completeDate ?? m.sprint.endDate)}</td>
                    <td className="num">{fmtInt(m.committed)}</td>
                    <td className="num">{fmtInt(m.carried)}</td>
                    <td className="num">{fmtInt(m.added)}</td>
                    <td className="num">{m.mode === 'historial' ? fmtInt(m.removed.length) : '—'}</td>
                    <td className="num">{fmtInt(m.total)}</td>
                    {categories.map((c) => (
                      <td key={c} className="num">
                        {fmtInt(m.counts[c])}
                      </td>
                    ))}
                    <td className="num font-medium">{m.mode === 'planificado' ? '—' : fmtPct(m.pct)}</td>
                    <td className="num">{m.mode === 'planificado' ? '—' : fmtPct(m.commitmentPct)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {detail && <SprintDetail model={model} m={detail} />}
    </div>
  );
}

function SprintDetail({ model, m }: { model: Model; m: SprintMetrics }) {
  const s = m.sprint;
  const refLabel = m.mode === 'planificado' ? 'Estado actual' : s.state === 'closed' ? 'Estado al cierre' : 'Estado actual';
  const order: SprintUnit['join'][] = ['comprometida', 'arrastrada', 'agregada'];
  const scope = m.scope.slice().sort((a, b) => order.indexOf(a.join) - order.indexOf(b.join) || a.unit.key.localeCompare(b.unit.key, undefined, { numeric: true }));

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <Swatch color={projectColor(s.projectKey)} />
          {s.projectLabel} · {s.name}
          <Badge>{STATE_LABEL[s.state]}</Badge>
          {m.mode === 'aproximado' && <Badge tone="warn">Sin historial: aproximado</Badge>}
        </span>
      }
      subtitle={`${formatDateTime(s.startDate)} → ${formatDateTime(s.completeDate ?? s.endDate)}${s.goal ? ` · Objetivo: ${s.goal}` : ''}`}
    >
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Kpi label="Comprometidas al inicio" value={fmtInt(m.committed)} />
        <Kpi label="Arrastradas" value={fmtInt(m.carried)} hint="del sprint anterior" />
        <Kpi label="Agregadas después" value={fmtInt(m.added)} />
        <Kpi label="Retiradas / trasladadas" value={m.mode === 'historial' ? fmtInt(m.removed.length) : '—'} hint="no cuentan en el alcance" />
        <Kpi label="Completadas" value={fmtInt(m.completed)} hint={`de ${fmtInt(m.total)} en el alcance`} />
        <Kpi label="Avance del sprint" value={m.mode === 'planificado' ? '—' : fmtPct(m.pct)} />
        <Kpi label="Cumplimiento del compromiso" value={m.mode === 'planificado' ? '—' : fmtPct(m.commitmentPct)} />
      </div>

      {m.alreadyDone.length > 0 && (
        <div className="mb-3">
          <Notice>
            {plural(m.alreadyDone.length, 'actividad ya estaba completada', 'actividades ya estaban completadas')} al entrar
            al sprint y no se cuentan: {m.alreadyDone.map((u) => u.key).join(', ')}.
          </Notice>
        </div>
      )}

      <TableScroll>
        <table className="data-table">
          <thead>
            <tr>
              <th>Actividad</th>
              <th>Responsable</th>
              <th>Ingreso</th>
              <th>{refLabel}</th>
            </tr>
          </thead>
          <tbody>
            {scope.map((su) => (
              <tr key={su.unit.key}>
                <td className="min-w-[18rem]">
                  <IssueLink model={model} issueKey={su.unit.key} /> <span className="text-ink-2">{su.unit.summary}</span>
                </td>
                <td className="whitespace-nowrap">{su.unit.assignee?.displayName ?? <span className="text-muted">Sin asignar</span>}</td>
                <td className="whitespace-nowrap">
                  {JOIN_LABEL[su.join]}
                  {su.join === 'arrastrada' && su.carriedFrom && (
                    <span className="text-muted"> ({model.sprintById.get(su.carriedFrom)?.name})</span>
                  )}
                  {su.join === 'agregada' && <span className="text-muted"> ({formatDate(new Date(su.joinedAt).toISOString())})</span>}
                </td>
                <td className="whitespace-nowrap">
                  <CategoryTag c={su.categoryAtRef} />
                </td>
              </tr>
            ))}
            {scope.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-ink-2">
                  No hay actividades en este sprint con los filtros actuales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>

      {m.removed.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold text-ink">Retiradas o trasladadas durante el sprint</h3>
          <TableScroll>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Actividad</th>
                  <th>Salió</th>
                  <th>Pasó a</th>
                  <th>Estado actual</th>
                </tr>
              </thead>
              <tbody>
                {m.removed.map((r) => (
                  <tr key={r.unit.key}>
                    <td className="min-w-[18rem]">
                      <IssueLink model={model} issueKey={r.unit.key} /> <span className="text-ink-2">{r.unit.summary}</span>
                    </td>
                    <td className="whitespace-nowrap">{r.leftAt ? formatDateTime(new Date(r.leftAt).toISOString()) : '—'}</td>
                    <td>{r.movedTo.map((id) => model.sprintById.get(id)?.name ?? `#${id}`).join(', ') || 'Backlog'}</td>
                    <td>
                      <CategoryTag c={r.unit.category} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}
    </Card>
  );
}

function CategoryTag({ c }: { c: AnyCategory }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Swatch color={CATEGORY_COLOR[c]} />
      {CATEGORY_LABEL[c]}
    </span>
  );
}
