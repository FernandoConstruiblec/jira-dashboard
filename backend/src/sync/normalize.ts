import type {
  ChangeEvent,
  DashboardConfig,
  IssueLevel,
  Snapshot,
  SnapshotIssue,
  SnapshotSprint,
  SnapshotStatus,
} from '../contract/snapshot';
import type { RawChangeHistory, RawDump, RawIssue, RawSprint } from '../jira/jira.types';

/** Campos que se piden a Jira para cada incidencia. */
export function issueFields(cfg: DashboardConfig): string[] {
  return [
    'summary',
    'issuetype',
    'status',
    'assignee',
    'parent',
    'project',
    'created',
    'duedate',
    'statuscategorychangedate',
    cfg.fields.sprint,
    cfg.fields.startDate,
  ];
}

/**
 * Convierte fechas de Jira a ISO UTC. Acepta "2026-11-06T11:23:04.035-0500",
 * ISO estándar y epoch en segundos o milisegundos.
 */
export function toIsoUtc(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value !== 'string') return null;
  const fixed = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const d = new Date(fixed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Fecha sin hora (YYYY-MM-DD) o null. */
export function toDateOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : null;
}

export function issueLevel(issuetype: RawIssue['fields']['issuetype']): IssueLevel {
  if (!issuetype) return 'other';
  if (issuetype.subtask || issuetype.hierarchyLevel === -1) return 'subtask';
  const level = issuetype.hierarchyLevel ?? 0;
  if (level === 0) return 'standard';
  if (level === 1) return 'epic';
  return 'other';
}

export function normalizeIssue(raw: RawIssue, cfg: DashboardConfig): SnapshotIssue {
  const f = raw.fields;
  const sprintsRaw = f[cfg.fields.sprint];
  const sprintIds = Array.isArray(sprintsRaw)
    ? (sprintsRaw as { id: number }[]).map((s) => Number(s.id)).filter(Number.isFinite)
    : [];

  return {
    id: String(raw.id),
    key: raw.key,
    projectKey: f.project?.key ?? raw.key.split('-')[0],
    summary: f.summary ?? '',
    typeName: f.issuetype?.name ?? '',
    level: issueLevel(f.issuetype),
    statusId: String(f.status?.id ?? ''),
    statusName: f.status?.name ?? '',
    assignee: f.assignee ? { accountId: f.assignee.accountId, displayName: f.assignee.displayName } : null,
    parentKey: f.parent?.key ?? null,
    created: toIsoUtc(f.created) ?? new Date(0).toISOString(),
    statusCategoryChanged: toIsoUtc(f.statuscategorychangedate),
    startDate: toDateOnly(f[cfg.fields.startDate]),
    dueDate: toDateOnly(f.duedate),
    sprintIds: [...new Set(sprintIds)],
  };
}

function sprintState(state: string): SnapshotSprint['state'] {
  const s = state.toLowerCase();
  return s === 'active' || s === 'closed' ? s : 'future';
}

function normalizeSprint(raw: RawSprint, projectKey: string, boardId: number): SnapshotSprint {
  return {
    id: Number(raw.id),
    name: raw.name,
    state: sprintState(raw.state),
    projectKey,
    boardId,
    goal: raw.goal ?? '',
    startDate: toIsoUtc(raw.startDate),
    endDate: toIsoUtc(raw.endDate),
    completeDate: toIsoUtc(raw.completeDate),
  };
}

/**
 * Sprints de los tableros configurados. Un sprint pertenece al proyecto del tablero
 * donde se creó (originBoardId). Los sprints que solo aparecen en incidencias
 * (p. ej. de otro tablero) se agregan con los datos que trae la incidencia.
 */
export function normalizeSprints(
  dump: RawDump,
  cfg: DashboardConfig,
  issues: RawIssue[],
  warnings: string[],
): SnapshotSprint[] {
  const projectByBoard = new Map(cfg.projects.map((p) => [p.boardId, p.key]));
  const byId = new Map<number, SnapshotSprint>();

  for (const p of cfg.projects) {
    for (const raw of dump.sprints[String(p.boardId)] ?? []) {
      const origin = raw.originBoardId ?? p.boardId;
      const projectKey = projectByBoard.get(origin) ?? p.key;
      if (!byId.has(Number(raw.id))) byId.set(Number(raw.id), normalizeSprint(raw, projectKey, origin));
    }
  }

  for (const issue of issues) {
    const list = issue.fields[cfg.fields.sprint];
    if (!Array.isArray(list)) continue;
    for (const raw of list as RawSprint[]) {
      if (byId.has(Number(raw.id))) continue;
      const boardId = raw.boardId ?? raw.originBoardId ?? -1;
      const projectKey = projectByBoard.get(boardId) ?? issue.fields.project?.key ?? issue.key.split('-')[0];
      byId.set(Number(raw.id), normalizeSprint(raw, projectKey, boardId));
      warnings.push(
        `El sprint "${raw.name}" (${raw.id}) no está en los tableros configurados; se tomó de ${issue.key}.`,
      );
    }
  }

  return [...byId.values()].sort(
    (a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999') || a.id - b.id,
  );
}

export function normalizeChangelog(
  histories: RawChangeHistory[],
  sprintFieldId: string,
): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  for (const h of histories) {
    const at = toIsoUtc(h.created);
    if (!at) continue;
    for (const item of h.items ?? []) {
      const fieldId = item.fieldId ?? '';
      let field: ChangeEvent['field'] | null = null;
      if (fieldId === 'status' || (!fieldId && item.field === 'status')) field = 'status';
      else if (fieldId === sprintFieldId || (!fieldId && item.field === 'Sprint')) field = 'sprint';
      if (!field) continue;
      events.push({ at, field, from: item.from ?? null, to: item.to ?? null });
    }
  }
  // Orden estable por fecha: el historial de Jira ya viene ordenado, pero la API
  // masiva puede intercalar páginas.
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.at.localeCompare(b.e.at) || a.i - b.i)
    .map(({ e }) => e);
}

export function normalizeStatuses(dump: RawDump): SnapshotStatus[] {
  const out = new Map<string, SnapshotStatus>();
  for (const [projectKey, types] of Object.entries(dump.statuses)) {
    for (const t of types) {
      for (const s of t.statuses) {
        const k = `${projectKey}:${s.id}`;
        if (!out.has(k)) {
          out.set(k, {
            projectKey,
            id: String(s.id),
            name: s.name,
            jiraCategory: s.statusCategory?.key ?? '',
          });
        }
      }
    }
  }
  return [...out.values()];
}

export function buildSnapshot(
  dump: RawDump,
  cfg: DashboardConfig,
  source: Snapshot['source'],
  now = new Date(),
  jiraBaseUrl: string | null = null,
): Snapshot {
  const warnings: string[] = [];
  const configured = new Set(cfg.projects.map((p) => p.key));
  const rawIssues = dump.issues.filter((i) => configured.has(i.fields.project?.key ?? i.key.split('-')[0]));
  const issues = rawIssues.map((r) => normalizeIssue(r, cfg));

  let changelogs: Snapshot['changelogs'] = null;
  if (dump.changelogs) {
    changelogs = {};
    for (const [key, histories] of Object.entries(dump.changelogs)) {
      const events = normalizeChangelog(histories, cfg.fields.sprint);
      if (events.length) changelogs[key] = events;
    }
  }
  if (dump.historyError) warnings.push(`Historial de sprints no disponible: ${dump.historyError}`);

  return {
    generatedAt: now.toISOString(),
    source,
    jiraBaseUrl: jiraBaseUrl ? jiraBaseUrl.replace(/\/+$/, '') : null,
    config: cfg,
    projects: cfg.projects.map((p) => ({
      key: p.key,
      label: p.label,
      name: dump.projectNames[p.key] ?? p.key,
    })),
    statuses: normalizeStatuses(dump),
    issues,
    sprints: normalizeSprints(dump, cfg, rawIssues, warnings),
    changelogs,
    history: {
      available: dump.changelogs !== null,
      method: dump.changelogs !== null ? dump.historyMethod : null,
      error: dump.historyError,
    },
    warnings,
  };
}
