/** Constructores de datos para los tests del dominio. */
import type { ChangeEvent, DashboardConfig, Snapshot, SnapshotIssue, SnapshotSprint } from './contract';

export const FERNANDO = { accountId: 'fer', displayName: 'Fernando Nagua' };
export const ANGEL = { accountId: 'ang', displayName: 'Angel Pastaz' };
export const PAMELA = { accountId: 'pam', displayName: 'Pamela Calo' };
export const OTRO = { accountId: 'otro', displayName: 'Otra Persona' };

export const config: DashboardConfig = {
  projects: [
    { key: 'SGCC', label: 'KMS', boardId: 167 },
    { key: 'CSE', label: 'Prototipo', boardId: 67, excludeEpics: ['CSE-90'], excludeSprintPattern: 'IoT' },
  ],
  statusMap: {
    '10216': 'POR_HACER',
    '10217': 'EN_CURSO',
    '10218': 'EN_REVISION',
    '10219': 'COMPLETADA',
    '10071': 'POR_HACER',
    '10072': 'EN_CURSO',
    '10074': 'EN_REVISION',
    '10183': 'VALIDACION_TECNICA',
    '10073': 'COMPLETADA',
  },
  hideEmptyCategories: ['VALIDACION_TECNICA'],
  fields: { sprint: 'customfield_10020', startDate: 'customfield_10015' },
  duration: { mode: 'businessDays', holidays: [] },
  people: [
    { accountId: 'fer', name: 'Fernando Nagua', role: 'Desarrollador', focus: true },
    { accountId: 'ang', name: 'Angel Pastaz', role: 'Desarrollador', focus: true },
    { accountId: 'pam', name: 'Pamela Calo', role: 'Scrum Master' },
  ],
};

const DONE: Record<string, string> = { SGCC: '10219', CSE: '10073' };
const TODO: Record<string, string> = { SGCC: '10216', CSE: '10071' };

type IssueInput = Partial<SnapshotIssue> & { key: string };

export function issue(input: IssueInput): SnapshotIssue {
  const projectKey = input.projectKey ?? input.key.split('-')[0];
  return {
    id: input.key.replace(/\D/g, ''),
    projectKey,
    summary: input.key,
    typeName: 'Historia',
    level: 'standard',
    statusId: TODO[projectKey],
    statusName: 'Por hacer',
    assignee: null,
    parentKey: null,
    created: '2026-10-01T00:00:00.000Z',
    statusCategoryChanged: null,
    startDate: null,
    dueDate: null,
    sprintIds: [],
    ...input,
  };
}

export const epic = (key: string, start: string | null, due: string | null, extra: Partial<SnapshotIssue> = {}) =>
  issue({ key, level: 'epic', typeName: 'Epic', startDate: start, dueDate: due, ...extra });

export const done = (projectKey: string) => ({ statusId: DONE[projectKey], statusName: 'Listo' });

export function sprint(input: Partial<SnapshotSprint> & { id: number; projectKey: string }): SnapshotSprint {
  return {
    name: `Sprint ${input.id}`,
    state: 'closed',
    boardId: input.projectKey === 'SGCC' ? 167 : 67,
    goal: '',
    startDate: null,
    endDate: null,
    completeDate: null,
    ...input,
  };
}

export function snapshot(
  issues: SnapshotIssue[],
  sprints: SnapshotSprint[] = [],
  changelogs: Record<string, ChangeEvent[]> | null = {},
  generatedAt = '2026-11-12T12:00:00.000Z',
): Snapshot {
  return {
    generatedAt,
    source: 'fixture',
    jiraBaseUrl: 'https://ejemplo.atlassian.net',
    config,
    projects: [
      { key: 'SGCC', label: 'KMS', name: 'Sistema de Gestión de Conocimiento' },
      { key: 'CSE', label: 'Prototipo', name: 'Prototipo DT4FM' },
    ],
    statuses: [],
    issues,
    sprints,
    changelogs,
    history: { available: changelogs !== null, method: changelogs ? 'fixture' : null, error: null },
    warnings: [],
  };
}
