/**
 * Contrato entre backend y frontend.
 *
 * Este archivo tiene una copia exacta en frontend/src/domain/contract.ts.
 * Si cambias uno, cambia el otro (el test `contract.spec.ts` compara ambos).
 */

export type Category =
  | 'POR_HACER'
  | 'EN_CURSO'
  | 'EN_REVISION'
  | 'VALIDACION_TECNICA'
  | 'COMPLETADA';

export interface ProjectConfig {
  key: string;
  label: string;
  boardId: number;
  /** Épicos (y todo lo que cuelga de ellos) que no entran al dashboard. */
  excludeEpics?: string[];
  /** Sprints cuyo nombre contiene este texto (sin distinguir mayúsculas) quedan fuera. */
  excludeSprintPattern?: string;
}

export interface PersonConfig {
  accountId: string;
  name: string;
  role?: string;
  /** Personas destacadas en la vista por persona. */
  focus?: boolean;
}

/** Día no laborable que se descuenta de la duración en días hábiles. */
export interface Holiday {
  /** AAAA-MM-DD: el día que efectivamente se descansa (con traslados). */
  date: string;
  name: string;
}

export interface DashboardConfig {
  projects: ProjectConfig[];
  /** ID de estado de Jira -> categoría del dashboard. Nunca se usa statusCategory. */
  statusMap: Record<string, Category>;
  /** Categorías que no se muestran mientras no tengan actividades. */
  hideEmptyCategories: Category[];
  fields: { sprint: string; startDate: string };
  duration: { mode: 'businessDays' | 'calendarDays'; holidays: Holiday[] };
  people: PersonConfig[];
}

export type IssueLevel = 'epic' | 'standard' | 'subtask' | 'other';

export interface SnapshotIssue {
  id: string;
  key: string;
  projectKey: string;
  summary: string;
  typeName: string;
  level: IssueLevel;
  statusId: string;
  statusName: string;
  assignee: { accountId: string; displayName: string } | null;
  parentKey: string | null;
  /** ISO 8601 (UTC). */
  created: string;
  /** ISO 8601 (UTC). Último cambio de categoría de estado en Jira. */
  statusCategoryChanged: string | null;
  /** YYYY-MM-DD */
  startDate: string | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  sprintIds: number[];
}

export interface SnapshotSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  projectKey: string;
  boardId: number;
  goal: string;
  /** ISO 8601 (UTC) */
  startDate: string | null;
  endDate: string | null;
  completeDate: string | null;
}

export interface SnapshotStatus {
  projectKey: string;
  id: string;
  name: string;
  jiraCategory: string;
}

export interface ChangeEvent {
  /** ISO 8601 (UTC) */
  at: string;
  field: 'status' | 'sprint';
  /** status: ID de estado. sprint: IDs separados por coma ("739, 743"). */
  from: string | null;
  to: string | null;
}

export interface HistoryInfo {
  available: boolean;
  method: 'bulk' | 'per-issue' | 'fixture' | null;
  error: string | null;
}

export interface Snapshot {
  generatedAt: string;
  source: 'jira' | 'fixture';
  /** Para enlazar a las incidencias (https://sitio.atlassian.net). */
  jiraBaseUrl: string | null;
  config: DashboardConfig;
  projects: { key: string; name: string; label: string }[];
  statuses: SnapshotStatus[];
  issues: SnapshotIssue[];
  sprints: SnapshotSprint[];
  /** Historial por clave de incidencia. null si no se pudo recuperar. */
  changelogs: Record<string, ChangeEvent[]> | null;
  history: HistoryInfo;
  warnings: string[];
}
