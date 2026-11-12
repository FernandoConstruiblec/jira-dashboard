import { IssueLink } from '../components/IssueLink';
import { Badge, Card, Notice, TableScroll } from '../components/ui';
import { CATEGORY_LABEL } from '../domain/categories';
import type { Model } from '../domain/model';
import { fmtInt } from '../format';

const METHOD: Record<string, string> = {
  bulk: 'API masiva de Jira',
  'per-issue': 'API por incidencia',
  fixture: 'archivo local',
};

/** Configuración vigente y avisos de calidad de datos (solo lectura). */
export function ConfigView({ model }: { model: Model }) {
  const cfg = model.config;
  const unitsByStatus = new Map<string, number>();
  for (const u of model.units) unitsByStatus.set(`${u.projectKey}:${u.statusId}`, (unitsByStatus.get(`${u.projectKey}:${u.statusId}`) ?? 0) + 1);
  const label = new Map(model.projects.map((p) => [p.key, p.label]));
  const noDuration = model.epics.filter((e) => e.duration === null);

  return (
    <div className="space-y-4">
      <Notice>
        La configuración se edita en <code>backend/dashboard.config.json</code> y se aplica en la siguiente actualización de
        datos, sin reiniciar el servidor.
      </Notice>

      {(model.unmappedStatuses.length > 0 || model.warnings.length > 0) && (
        <Card title="Avisos">
          <div className="space-y-2">
            {model.unmappedStatuses.map((s) => (
              <Notice key={`${s.projectKey}:${s.statusId}`} tone="warn">
                El estado «{s.statusName}» (ID {s.statusId}) de {label.get(s.projectKey)} no está en <code>statusMap</code>;{' '}
                {fmtInt(s.units)} actividades aparecen como «Estado sin mapear».
              </Notice>
            ))}
            {model.warnings.map((w) => (
              <Notice key={w} tone="warn">
                {w}
              </Notice>
            ))}
          </div>
        </Card>
      )}

      <Card title="Mapeo de estados" subtitle="Cada estado de Jira se asigna por su ID a una categoría del dashboard; no se usa la categoría propia de Jira.">
        <TableScroll>
          <table className="data-table">
            <thead>
              <tr>
                <th>Proyecto</th>
                <th>ID</th>
                <th>Estado en Jira</th>
                <th>Categoría en Jira</th>
                <th>Categoría en el dashboard</th>
                <th className="num">Actividades</th>
              </tr>
            </thead>
            <tbody>
              {statusRows(model).map((r) => (
                <tr key={`${r.projectKey}:${r.id}`}>
                  <td>{label.get(r.projectKey)}</td>
                  <td className="tabular">{r.id}</td>
                  <td>{r.name}</td>
                  <td className="text-ink-2">{r.jiraCategory || '—'}</td>
                  <td>
                    {cfg.statusMap[r.id] ? CATEGORY_LABEL[cfg.statusMap[r.id]] : <Badge tone="warn">Sin mapear</Badge>}
                    {cfg.statusMap[r.id] === 'COMPLETADA' && r.jiraCategory !== 'done' && <span className="text-muted"> (difiere de Jira)</span>}
                    {cfg.statusMap[r.id] && cfg.statusMap[r.id] !== 'COMPLETADA' && r.jiraCategory === 'done' && (
                      <span className="text-muted"> (Jira la considera terminada)</span>
                    )}
                  </td>
                  <td className="num">{fmtInt(unitsByStatus.get(`${r.projectKey}:${r.id}`) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        {cfg.hideEmptyCategories.length > 0 && (
          <p className="mt-3 text-xs text-ink-2">
            Se ocultan mientras no tengan actividades: {cfg.hideEmptyCategories.map((c) => CATEGORY_LABEL[c]).join(', ')}.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Alcance">
          <ul className="space-y-3 text-sm">
            {cfg.projects.map((p) => (
              <li key={p.key}>
                <div className="font-medium text-ink">
                  {p.label} ({p.key}) · tablero {p.boardId}
                </div>
                <div className="text-xs text-ink-2">
                  {p.excludeEpics?.length ? `Épicos excluidos: ${p.excludeEpics.join(', ')}. ` : 'Sin épicos excluidos. '}
                  {p.excludeSprintPattern ? `Sprints excluidos: los que contienen «${p.excludeSprintPattern}».` : ''}
                </div>
              </li>
            ))}
            <li className="text-xs text-ink-2">
              Total fuera del dashboard: {fmtInt(model.excluded.epics)} épicos, {fmtInt(model.excluded.sprints)} sprints y{' '}
              {fmtInt(model.excluded.issues)} incidencias.
            </li>
          </ul>
        </Card>

        <Card title="Datos">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-2">Origen</dt>
            <dd>{model.source === 'jira' ? 'Jira en vivo' : 'Archivo local (fixture)'}</dd>
            <dt className="text-ink-2">Historial de sprints</dt>
            <dd>
              {model.historyInfo.available ? METHOD[model.historyInfo.method ?? ''] ?? 'disponible' : <Badge tone="warn">No disponible</Badge>}
            </dd>
            <dt className="text-ink-2">Duración de épicos</dt>
            <dd>
              {cfg.duration.mode === 'businessDays' ? 'Días hábiles (lunes a viernes)' : 'Días calendario'}
              {cfg.duration.holidays.length ? `, sin ${cfg.duration.holidays.length} feriados` : ', sin feriados configurados'}
            </dd>
            <dt className="text-ink-2">Equipo</dt>
            <dd>{cfg.people.map((p) => `${p.name}${p.role ? ` (${p.role})` : ''}`).join(', ')}</dd>
          </dl>
        </Card>
      </div>

      <Card
        title="Épicos sin duración planificada"
        subtitle="Quedan fuera del avance ponderado hasta que tengan fecha de inicio y de vencimiento en Jira."
      >
        {noDuration.length === 0 ? (
          <p className="text-sm text-ink-2">Todos los épicos tienen duración.</p>
        ) : (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {noDuration.map((e) => (
              <li key={e.key}>
                <IssueLink model={model} issueKey={e.key} /> <span className="text-ink-2">{e.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

interface StatusRow {
  projectKey: string;
  id: string;
  name: string;
  jiraCategory: string;
}

/** Estados del flujo de cada proyecto más los que aparecen en incidencias. */
function statusRows(model: Model): StatusRow[] {
  const rows = new Map<string, StatusRow>();
  for (const s of model.statusesFromJira) rows.set(`${s.projectKey}:${s.id}`, s);
  for (const i of model.issueByKey.values()) {
    const k = `${i.projectKey}:${i.statusId}`;
    if (!rows.has(k)) rows.set(k, { projectKey: i.projectKey, id: i.statusId, name: i.statusName, jiraCategory: '' });
  }
  return [...rows.values()].sort((a, b) => a.projectKey.localeCompare(b.projectKey) || a.id.localeCompare(b.id));
}
