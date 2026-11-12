/** Formas mínimas de las respuestas de la API REST de Jira Cloud que usamos. */

export interface RawIssue {
  id: string;
  key: string;
  fields: Record<string, unknown> & {
    summary?: string;
    issuetype?: { id: string; name: string; subtask?: boolean; hierarchyLevel?: number };
    status?: { id: string; name: string; statusCategory?: { key?: string } };
    assignee?: { accountId: string; displayName: string } | null;
    parent?: { id: string; key: string } | null;
    project?: { id: string; key: string; name: string };
    created?: string;
    duedate?: string | null;
    statuscategorychangedate?: string | null;
  };
}

export interface RawSprint {
  id: number;
  name: string;
  state: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  originBoardId?: number;
  boardId?: number;
}

export interface RawChangeItem {
  field?: string;
  fieldId?: string;
  from?: string | null;
  to?: string | null;
}

export interface RawChangeHistory {
  id?: string;
  /** ISO en /issue/{key}/changelog; epoch (s o ms) en /changelog/bulkfetch. */
  created: string | number;
  items: RawChangeItem[];
}

export interface RawProjectStatuses {
  name: string;
  statuses: { id: string; name: string; statusCategory?: { key?: string } }[];
}

/** Lo que se descarga de Jira; también es el formato de JIRA_FIXTURE_DIR. */
export interface RawDump {
  issues: RawIssue[];
  /** Por boardId. */
  sprints: Record<string, RawSprint[]>;
  /** Por clave de proyecto. */
  statuses: Record<string, RawProjectStatuses[]>;
  /** Por clave de incidencia. null = historial no disponible. */
  changelogs: Record<string, RawChangeHistory[]> | null;
  historyMethod: 'bulk' | 'per-issue' | 'fixture' | null;
  historyError: string | null;
  projectNames: Record<string, string>;
}
