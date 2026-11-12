import { useState } from 'react';
import { GroupedBars, PercentBars, StatusStackedBars } from '../components/charts';
import { FilterBar } from '../components/FilterBar';
import { Badge, Card, Kpi, Notice, TableScroll } from '../components/ui';
import { useFilters } from '../data';
import { CATEGORY_LABEL, visibleCategories } from '../domain/categories';
import type { Model } from '../domain/model';
import { peopleRows } from '../domain/people';
import { fmtInt, fmtPct } from '../format';
import { projectColor } from '../theme';

export function PeopleView({ model }: { model: Model }) {
  const { filters } = useFilters();
  const [teamOnly, setTeamOnly] = useState(true);
  const rows = peopleRows(model, filters, teamOnly);
  const categories = visibleCategories(rows.map((r) => r.counts), model.config);
  const projects = model.projects.filter((p) => !filters.project || p.key === filters.project);
  const focus = rows.filter((r) => r.focus);
  const label = (r: (typeof rows)[number]) => (r.role ? `${r.name} · ${r.role}` : r.name);

  return (
    <div className="space-y-4">
      <FilterBar model={model} hide={['person']} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-2">
          Responsable = campo Assignee actual de cada actividad (la subtarea, no su historia). Incluye ambos proyectos salvo
          que se filtre uno.
        </p>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={teamOnly} onChange={(e) => setTeamOnly(e.target.checked)} />
          Solo el equipo configurado
        </label>
      </div>

      {focus.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {focus.flatMap((r) => [
            <Kpi key={`${r.id}-p`} label={`${r.name}: avance`} value={fmtPct(r.completedPct)} hint={`${fmtInt(r.counts.COMPLETADA)} de ${fmtInt(r.total)} actividades`} />,
            <Kpi
              key={`${r.id}-c`}
              label={`${r.name}: carga abierta`}
              value={fmtInt(r.total - r.counts.COMPLETADA)}
              hint={projects.map((p) => `${p.label} ${fmtInt(r.byProject[p.key].total - r.byProject[p.key].completed)}`).join(' · ')}
            />,
          ])}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Avance individual" subtitle="Actividades completadas / actividades asignadas.">
          <PercentBars
            labelWidth={190}
            seriesName="Avance"
            rows={rows.map((r) => ({
              id: r.id,
              label: label(r),
              value: r.completedPct,
              color: r.unassigned ? 'var(--muted)' : 'var(--accent)',
              detail: `${r.counts.COMPLETADA} de ${r.total}`,
            }))}
          />
        </Card>
        <Card title="Actividades por estado y persona">
          <StatusStackedBars
            labelWidth={190}
            categories={categories}
            rows={rows.map((r) => ({ id: r.id, label: label(r), counts: r.counts }))}
          />
        </Card>
      </div>

      <Card title="Carga por proyecto" subtitle="Actividades asignadas a cada persona en cada proyecto (todas, incluidas las completadas).">
        <GroupedBars
          unit="count"
          labelWidth={190}
          series={projects.map((p) => ({ key: p.key, label: p.label, color: projectColor(p.key) }))}
          rows={rows.map((r) => ({ id: r.id, label: label(r), values: Object.fromEntries(projects.map((p) => [p.key, r.byProject[p.key].total])) }))}
        />
      </Card>

      <Card title="Detalle de carga de trabajo">
        <TableScroll>
          <table className="data-table">
            <thead>
              <tr>
                <th>Persona</th>
                <th className="num">Asignadas</th>
                {categories.map((c) => (
                  <th key={c} className="num">
                    {c === 'POR_HACER' ? 'Pendientes' : CATEGORY_LABEL[c]}
                  </th>
                ))}
                <th className="num">Avance</th>
                {projects.map((p) => (
                  <th key={p.key} className="num" title="Completadas / asignadas">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">
                    <span className={r.unassigned ? 'text-ink-2' : ''}>{r.name}</span>{' '}
                    {r.role && <Badge tone={r.focus ? 'accent' : 'neutral'}>{r.role}</Badge>}
                  </td>
                  <td className="num">{fmtInt(r.total)}</td>
                  {categories.map((c) => (
                    <td key={c} className="num">
                      {fmtInt(r.counts[c])}
                    </td>
                  ))}
                  <td className="num font-medium">{fmtPct(r.completedPct)}</td>
                  {projects.map((p) => (
                    <td key={p.key} className="num whitespace-nowrap">
                      {fmtInt(r.byProject[p.key].completed)} / {fmtInt(r.byProject[p.key].total)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {!teamOnly && (
        <Notice>
          Se muestran también personas fuera del equipo configurado que tienen actividades asignadas en el alcance del
          dashboard.
        </Notice>
      )}
    </div>
  );
}
