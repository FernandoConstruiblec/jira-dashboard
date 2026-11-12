import { categorize, type UnitCategory } from './categories';
import type {
  ChangeEvent,
  DashboardConfig,
  PersonConfig,
  Snapshot,
  SnapshotIssue,
  SnapshotSprint,
  SnapshotStatus,
} from './contract';
import { durationDays } from './dates';

/**
 * Unidad de ejecución (UE): la pieza que se cuenta.
 * - Una historia/tarea/error con subtareas aporta sus subtareas (el padre no cuenta).
 * - Una historia/tarea/error sin subtareas es su propia UE.
 * - Los épicos nunca son UE.
 */
export interface Unit {
  key: string;
  summary: string;
  projectKey: string;
  typeName: string;
  isSubtask: boolean;
  /** Para subtareas: la historia/tarea padre. */
  parentKey: string | null;
  epicKey: string | null;
  statusId: string;
  statusName: string;
  category: UnitCategory;
  assignee: { accountId: string; displayName: string } | null;
  sprintIds: number[];
  /** Incidencia cuyo campo Sprint define la pertenencia (las subtareas heredan del padre). */
  membershipKey: string;
  created: number;
  statusCategoryChanged: number | null;
}

export type DurationIssue = 'sin-fechas' | 'solo-inicio' | 'solo-fin' | 'fechas-invertidas' | null;

export interface Epic {
  key: string;
  projectKey: string;
  summary: string;
  statusName: string;
  category: UnitCategory;
  startDate: string | null;
  dueDate: string | null;
  /** Peso del épico en días; null si no puede calcularse. */
  duration: number | null;
  durationIssue: DurationIssue;
  unitKeys: string[];
}

export interface SprintInfo extends SnapshotSprint {
  projectLabel: string;
}

export interface ProjectInfo {
  key: string;
  label: string;
  name: string;
}

export interface PersonInfo {
  accountId: string;
  name: string;
  role: string | null;
  focus: boolean;
  configured: boolean;
}

export interface UnmappedStatus {
  projectKey: string;
  statusId: string;
  statusName: string;
  units: number;
}

export interface Model {
  generatedAt: number;
  source: Snapshot['source'];
  jiraBaseUrl: string | null;
  config: DashboardConfig;
  projects: ProjectInfo[];
  units: Unit[];
  unitByKey: Map<string, Unit>;
  epics: Epic[];
  epicByKey: Map<string, Epic>;
  sprints: SprintInfo[];
  sprintById: Map<number, SprintInfo>;
  issueByKey: Map<string, SnapshotIssue>;
  /** Estados definidos en el flujo de cada proyecto (para revisar el mapeo). */
  statusesFromJira: SnapshotStatus[];
  /** Eventos por incidencia, en orden cronológico, con fecha numérica. null = sin historial. */
  history: Map<string, TimedEvent[]> | null;
  historyInfo: Snapshot['history'];
  people: PersonInfo[];
  excluded: { issues: number; epics: number; sprints: number };
  unmappedStatuses: UnmappedStatus[];
  warnings: string[];
}

export interface TimedEvent extends ChangeEvent {
  time: number;
}

function sprintExcluded(sprint: SnapshotSprint, config: DashboardConfig): boolean {
  const pattern = config.projects.find((p) => p.key === sprint.projectKey)?.excludeSprintPattern;
  return Boolean(pattern) && sprint.name.toLowerCase().includes(pattern!.toLowerCase());
}

function durationIssue(start: string | null, end: string | null, duration: number | null): DurationIssue {
  if (duration !== null) return null;
  if (!start && !end) return 'sin-fechas';
  if (!end) return 'solo-inicio';
  if (!start) return 'solo-fin';
  return 'fechas-invertidas';
}

const ts = (iso: string | null): number | null => (iso ? Date.parse(iso) : null);

export function buildModel(snapshot: Snapshot): Model {
  const config = snapshot.config;
  const issueByKey = new Map(snapshot.issues.map((i) => [i.key, i]));
  const projectLabel = new Map(snapshot.projects.map((p) => [p.key, p.label]));

  // --- Sprints -------------------------------------------------------------
  const excludedSprintIds = new Set<number>();
  const sprints: SprintInfo[] = [];
  for (const s of snapshot.sprints) {
    if (!projectLabel.has(s.projectKey) || sprintExcluded(s, config)) {
      excludedSprintIds.add(s.id);
      continue;
    }
    sprints.push({ ...s, projectLabel: projectLabel.get(s.projectKey)! });
  }

  // --- Jerarquía ------------------------------------------------------------
  const childrenOf = new Map<string, SnapshotIssue[]>();
  for (const i of snapshot.issues) {
    if (i.level === 'subtask' && i.parentKey) {
      const list = childrenOf.get(i.parentKey) ?? [];
      list.push(i);
      childrenOf.set(i.parentKey, list);
    }
  }

  const epicOf = (issue: SnapshotIssue): string | null => {
    if (issue.level === 'standard') {
      const parent = issue.parentKey ? issueByKey.get(issue.parentKey) : undefined;
      return parent?.level === 'epic' ? parent.key : null;
    }
    if (issue.level === 'subtask') {
      const parent = issue.parentKey ? issueByKey.get(issue.parentKey) : undefined;
      return parent ? epicOf(parent) : null;
    }
    return null;
  };

  const excludedEpics = new Set(config.projects.flatMap((p) => p.excludeEpics ?? []));

  // Una incidencia sin épico queda fuera si todos sus sprints están excluidos
  // (p. ej. tareas sueltas de sprints IoT).
  const onlyExcludedSprints = (ids: number[]) =>
    ids.length > 0 && ids.every((id) => excludedSprintIds.has(id));

  const isExcluded = (issue: SnapshotIssue, epicKey: string | null): boolean => {
    if (epicKey && excludedEpics.has(epicKey)) return true;
    if (!epicKey) {
      const membership =
        issue.level === 'subtask' && issue.parentKey ? issueByKey.get(issue.parentKey) ?? issue : issue;
      if (onlyExcludedSprints(membership.sprintIds)) return true;
    }
    return false;
  };

  // --- Unidades de ejecución ----------------------------------------------
  const units: Unit[] = [];
  let excludedIssues = 0;

  const toUnit = (issue: SnapshotIssue, epicKey: string | null, membership: SnapshotIssue): Unit => ({
    key: issue.key,
    summary: issue.summary,
    projectKey: issue.projectKey,
    typeName: issue.typeName,
    isSubtask: issue.level === 'subtask',
    parentKey: issue.level === 'subtask' ? issue.parentKey : null,
    epicKey,
    statusId: issue.statusId,
    statusName: issue.statusName,
    category: categorize(issue.statusId, config),
    assignee: issue.assignee,
    // Las subtareas heredan el sprint del padre; se usa el del padre por consistencia.
    sprintIds: membership.sprintIds.filter((id) => !excludedSprintIds.has(id)),
    membershipKey: membership.key,
    created: Date.parse(issue.created),
    statusCategoryChanged: ts(issue.statusCategoryChanged),
  });

  for (const issue of snapshot.issues) {
    if (issue.level !== 'standard') continue;
    const epicKey = epicOf(issue);
    const subtasks = childrenOf.get(issue.key) ?? [];
    if (isExcluded(issue, epicKey)) {
      excludedIssues += 1 + subtasks.length;
      continue;
    }
    if (subtasks.length === 0) units.push(toUnit(issue, epicKey, issue));
    else for (const st of subtasks) units.push(toUnit(st, epicKey, issue));
  }

  // Subtareas cuyo padre no se descargó (no debería ocurrir): se cuentan solas.
  for (const issue of snapshot.issues) {
    if (issue.level !== 'subtask') continue;
    if (issue.parentKey && issueByKey.has(issue.parentKey)) continue;
    if (isExcluded(issue, null)) {
      excludedIssues++;
      continue;
    }
    units.push(toUnit(issue, null, issue));
  }

  units.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  const unitByKey = new Map(units.map((u) => [u.key, u]));

  // --- Épicos -------------------------------------------------------------
  const epics: Epic[] = [];
  for (const issue of snapshot.issues) {
    if (issue.level !== 'epic' || excludedEpics.has(issue.key)) continue;
    const duration = durationDays(issue.startDate, issue.dueDate, config.duration.mode, config.duration.holidays);
    epics.push({
      key: issue.key,
      projectKey: issue.projectKey,
      summary: issue.summary,
      statusName: issue.statusName,
      category: categorize(issue.statusId, config),
      startDate: issue.startDate,
      dueDate: issue.dueDate,
      duration,
      durationIssue: durationIssue(issue.startDate, issue.dueDate, duration),
      unitKeys: [],
    });
  }
  epics.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  const epicByKey = new Map(epics.map((e) => [e.key, e]));
  for (const u of units) if (u.epicKey) epicByKey.get(u.epicKey)?.unitKeys.push(u.key);

  // --- Historial ----------------------------------------------------------
  let history: Map<string, TimedEvent[]> | null = null;
  if (snapshot.changelogs) {
    history = new Map();
    for (const [key, events] of Object.entries(snapshot.changelogs)) {
      history.set(
        key,
        events.map((e) => ({ ...e, time: Date.parse(e.at) })).sort((a, b) => a.time - b.time),
      );
    }
  }

  // --- Personas -----------------------------------------------------------
  const configured = new Map<string, PersonConfig>(config.people.map((p) => [p.accountId, p]));
  const people = new Map<string, PersonInfo>();
  config.people.forEach((p) =>
    people.set(p.accountId, {
      accountId: p.accountId,
      name: p.name,
      role: p.role ?? null,
      focus: Boolean(p.focus),
      configured: true,
    }),
  );
  for (const u of units) {
    if (u.assignee && !people.has(u.assignee.accountId)) {
      people.set(u.assignee.accountId, {
        accountId: u.assignee.accountId,
        name: u.assignee.displayName,
        role: null,
        focus: false,
        configured: configured.has(u.assignee.accountId),
      });
    }
  }

  // --- Calidad de datos ---------------------------------------------------
  const unmapped = new Map<string, UnmappedStatus>();
  for (const u of units) {
    if (u.category !== 'SIN_MAPEAR') continue;
    const k = `${u.projectKey}:${u.statusId}`;
    const entry = unmapped.get(k) ?? { projectKey: u.projectKey, statusId: u.statusId, statusName: u.statusName, units: 0 };
    entry.units++;
    unmapped.set(k, entry);
  }

  return {
    generatedAt: Date.parse(snapshot.generatedAt),
    source: snapshot.source,
    jiraBaseUrl: snapshot.jiraBaseUrl,
    config,
    projects: snapshot.projects,
    units,
    unitByKey,
    epics,
    epicByKey,
    sprints,
    sprintById: new Map(sprints.map((s) => [s.id, s])),
    issueByKey,
    statusesFromJira: snapshot.statuses,
    history,
    historyInfo: snapshot.history,
    people: [...people.values()],
    excluded: {
      issues: excludedIssues,
      epics: snapshot.issues.filter((i) => i.level === 'epic' && excludedEpics.has(i.key)).length,
      sprints: excludedSprintIds.size,
    },
    unmappedStatuses: [...unmapped.values()],
    warnings: snapshot.warnings,
  };
}
