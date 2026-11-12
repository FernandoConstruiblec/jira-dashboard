import { validateConfig } from '../config/dashboard-config';
import type { RawDump, RawIssue } from '../jira/jira.types';
import { buildSnapshot, issueLevel, normalizeChangelog, normalizeIssue, toIsoUtc } from './normalize';

const cfg = validateConfig({
  projects: [
    { key: 'SGCC', label: 'KMS', boardId: 167 },
    { key: 'CSE', label: 'Prototipo', boardId: 67 },
  ],
  statusMap: { '10219': 'COMPLETADA' },
  fields: { sprint: 'customfield_10020', startDate: 'customfield_10015' },
});

function raw(key: string, fields: Partial<RawIssue['fields']> = {}): RawIssue {
  return {
    id: key.replace(/\D/g, ''),
    key,
    fields: {
      summary: key,
      issuetype: { id: '1', name: 'Historia', subtask: false, hierarchyLevel: 0 },
      status: { id: '10216', name: 'Por hacer' },
      project: { id: '1', key: key.split('-')[0], name: 'Proyecto' },
      created: '2026-10-25T23:03:30.864-0500',
      ...fields,
    },
  };
}

describe('toIsoUtc', () => {
  it('acepta el offset sin dos puntos que usa Jira', () => {
    expect(toIsoUtc('2026-11-06T07:44:20.642-0500')).toBe('2026-11-06T12:44:20.642Z');
  });
  it('acepta ISO estándar y epoch en segundos o milisegundos', () => {
    expect(toIsoUtc('2026-11-05T15:00:00.000Z')).toBe('2026-11-05T15:00:00.000Z');
    expect(toIsoUtc(1_700_000_000)).toBe('2023-11-14T22:13:20.000Z');
    expect(toIsoUtc(1_700_000_000_000)).toBe('2023-11-14T22:13:20.000Z');
  });
  it('devuelve null para valores vacíos o inválidos', () => {
    expect(toIsoUtc(null)).toBeNull();
    expect(toIsoUtc('')).toBeNull();
    expect(toIsoUtc('no es fecha')).toBeNull();
  });
});

describe('issueLevel', () => {
  it('usa hierarchyLevel y subtask, no el nombre localizado del tipo', () => {
    expect(issueLevel({ id: '1', name: 'Epic', hierarchyLevel: 1 })).toBe('epic');
    expect(issueLevel({ id: '1', name: 'Tarea', hierarchyLevel: 0 })).toBe('standard');
    expect(issueLevel({ id: '1', name: 'Subtarea', subtask: true, hierarchyLevel: -1 })).toBe('subtask');
    expect(issueLevel({ id: '1', name: 'Iniciativa', hierarchyLevel: 2 })).toBe('other');
  });
});

describe('normalizeIssue', () => {
  it('extrae sprints, fechas del épico, padre y responsable', () => {
    const issue = normalizeIssue(
      raw('SGCC-1', {
        issuetype: { id: '10000', name: 'Epic', hierarchyLevel: 1 },
        customfield_10015: '2026-10-29',
        duedate: '2026-11-06',
        customfield_10020: [{ id: 739 }, { id: 743 }, { id: 739 }],
        assignee: { accountId: 'a1', displayName: 'Pamela' },
        parent: { id: '9', key: 'SGCC-9' },
      }),
      cfg,
    );
    expect(issue).toMatchObject({
      key: 'SGCC-1',
      projectKey: 'SGCC',
      level: 'epic',
      startDate: '2026-10-29',
      dueDate: '2026-11-06',
      sprintIds: [739, 743],
      assignee: { accountId: 'a1', displayName: 'Pamela' },
      parentKey: 'SGCC-9',
      created: '2026-10-26T04:03:30.864Z',
    });
  });

  it('deja null lo que Jira no trae, sin inventar valores', () => {
    const issue = normalizeIssue(raw('CSE-5'), cfg);
    expect(issue.startDate).toBeNull();
    expect(issue.dueDate).toBeNull();
    expect(issue.assignee).toBeNull();
    expect(issue.sprintIds).toEqual([]);
  });
});

describe('normalizeChangelog', () => {
  it('conserva solo cambios de estado y sprint, ordenados por fecha', () => {
    const events = normalizeChangelog(
      [
        {
          created: '2026-11-06T11:23:04.035-0500',
          items: [{ field: 'status', fieldId: 'status', from: '10216', to: '10219' }],
        },
        {
          created: '2026-11-06T07:44:20.642-0500',
          items: [
            { field: 'Sprint', fieldId: 'customfield_10020', from: '739', to: '739, 743' },
            { field: 'summary', fieldId: 'summary' },
          ],
        },
      ],
      'customfield_10020',
    );
    expect(events).toEqual([
      { at: '2026-11-06T12:44:20.642Z', field: 'sprint', from: '739', to: '739, 743' },
      { at: '2026-11-06T16:23:04.035Z', field: 'status', from: '10216', to: '10219' },
    ]);
  });

  it('acepta la fecha en epoch de la API masiva', () => {
    const [e] = normalizeChangelog(
      [{ created: 1_700_000_000, items: [{ fieldId: 'status', from: '1', to: '2' }] }],
      'customfield_10020',
    );
    expect(e.at).toBe('2023-11-14T22:13:20.000Z');
  });
});

describe('buildSnapshot', () => {
  const dump: RawDump = {
    issues: [
      raw('SGCC-7', { customfield_10020: [{ id: 739, name: 'KMS Sprint 1', state: 'closed', boardId: 167 }] }),
      raw('OTRO-1'),
      raw('CSE-9', { customfield_10020: [{ id: 999, name: 'Sprint suelto', state: 'closed', boardId: 5 }] }),
    ],
    sprints: {
      '167': [
        {
          id: 739,
          name: 'KMS Sprint 1',
          state: 'closed',
          startDate: '2026-10-29T18:00:00.000Z',
          completeDate: '2026-11-06T12:44:20.448Z',
          originBoardId: 167,
        },
      ],
      '67': [],
    },
    statuses: {
      SGCC: [{ name: 'Historia', statuses: [{ id: '10219', name: 'Listo', statusCategory: { key: 'done' } }] }],
    },
    changelogs: null,
    historyMethod: null,
    historyError: 'sin permiso',
    projectNames: { SGCC: 'Sistema de Gestión de Conocimiento' },
  };

  const snap = buildSnapshot(dump, cfg, 'jira', new Date('2026-11-12T00:00:00Z'));

  it('descarta proyectos no configurados', () => {
    expect(snap.issues.map((i) => i.key)).toEqual(['SGCC-7', 'CSE-9']);
  });

  it('asigna cada sprint al proyecto de su tablero y avisa de sprints ajenos', () => {
    expect(snap.sprints.find((s) => s.id === 739)).toMatchObject({ projectKey: 'SGCC', state: 'closed' });
    expect(snap.sprints.find((s) => s.id === 999)).toMatchObject({ projectKey: 'CSE' });
    expect(snap.warnings.some((w) => w.includes('Sprint suelto'))).toBe(true);
  });

  it('informa cuando no hay historial', () => {
    expect(snap.changelogs).toBeNull();
    expect(snap.history).toEqual({ available: false, method: null, error: 'sin permiso' });
  });

  it('expone estados con su categoría de Jira para revisar el mapeo', () => {
    expect(snap.statuses).toEqual([{ projectKey: 'SGCC', id: '10219', name: 'Listo', jiraCategory: 'done' }]);
  });
});
