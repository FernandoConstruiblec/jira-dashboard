import { describe, expect, it } from 'vitest';
import type { ChangeEvent } from './contract';
import { buildModel } from './model';
import { sprintMetrics, sprintsAt, statusAt } from './sprints';
import { done, issue, snapshot, sprint } from './testkit';

/*
 * Reproduce lo ocurrido en KMS Sprint 1 -> KMS Sprint 2:
 * - El Sprint 2 empezó (5-nov 18:00) antes de cerrar el Sprint 1 (6-nov 12:44).
 * - Al cerrar, Jira movió las historias pendientes al Sprint 2 ("739" -> "739, 743").
 */
const S1 = sprint({
  id: 739,
  projectKey: 'SGCC',
  name: 'KMS Sprint 1',
  state: 'closed',
  startDate: '2026-10-29T18:00:00.000Z',
  endDate: '2026-11-05T15:00:00.000Z',
  completeDate: '2026-11-06T12:44:20.448Z',
});
const S2 = sprint({
  id: 743,
  projectKey: 'SGCC',
  name: 'KMS Sprint 2',
  state: 'active',
  startDate: '2026-11-05T18:00:33.275Z',
  endDate: '2026-11-12T18:00:00.000Z',
});

const ev = (at: string, field: ChangeEvent['field'], from: string, to: string): ChangeEvent => ({ at, field, from, to });

const issues = [
  // Historia sin subtareas, en el sprint desde el inicio, terminada a tiempo.
  issue({ key: 'SGCC-7', created: '2026-10-26T00:00:00Z', sprintIds: [739], ...done('SGCC') }),
  // Historia con dos subtareas, arrastrada al Sprint 2 al cerrar el Sprint 1.
  issue({ key: 'SGCC-8', created: '2026-10-26T00:00:00Z', sprintIds: [739, 743], ...done('SGCC') }),
  issue({ key: 'SGCC-9', level: 'subtask', parentKey: 'SGCC-8', created: '2026-10-30T00:00:00Z', sprintIds: [739, 743], ...done('SGCC') }),
  issue({ key: 'SGCC-10', level: 'subtask', parentKey: 'SGCC-8', created: '2026-10-30T00:00:00Z', sprintIds: [739, 743], ...done('SGCC') }),
  // Estaba en el Sprint 1 y se pasó a mano al Sprint 2 antes de que este empezara.
  issue({ key: 'SGCC-21', created: '2026-10-26T00:00:00Z', sprintIds: [743] }),
  // Se agregó al Sprint 2 ya iniciado.
  issue({ key: 'SGCC-20', created: '2026-10-26T00:00:00Z', sprintIds: [743], statusId: '10217', statusName: 'En curso' }),
  // Creada directamente dentro del Sprint 2 después del inicio.
  issue({ key: 'SGCC-22', created: '2026-11-09T00:00:00Z', sprintIds: [743] }),
];

const changelogs: Record<string, ChangeEvent[]> = {
  'SGCC-7': [
    ev('2026-10-27T00:00:00.000Z', 'sprint', '', '739'),
    ev('2026-11-04T00:00:00.000Z', 'status', '10216', '10219'),
  ],
  'SGCC-8': [
    ev('2026-10-27T00:00:00.000Z', 'sprint', '', '739'),
    ev('2026-11-06T12:44:20.642Z', 'sprint', '739', '739, 743'),
    ev('2026-11-07T00:00:00.000Z', 'status', '10216', '10219'),
  ],
  // Terminada antes del cierre del Sprint 1.
  'SGCC-9': [ev('2026-11-05T19:46:07.200Z', 'status', '10216', '10219')],
  // Terminada después del cierre, ya en el Sprint 2.
  'SGCC-10': [ev('2026-11-08T00:00:00.000Z', 'status', '10216', '10219')],
  'SGCC-21': [
    ev('2026-10-27T00:00:00.000Z', 'sprint', '', '739'),
    ev('2026-11-02T00:00:00.000Z', 'sprint', '739', '743'),
  ],
  'SGCC-20': [
    ev('2026-11-08T00:00:00.000Z', 'sprint', '', '743'),
    ev('2026-11-09T00:00:00.000Z', 'status', '10216', '10217'),
  ],
};

const model = buildModel(snapshot(issues, [S1, S2], changelogs, '2026-11-12T12:00:00.000Z'));
const s1 = model.sprintById.get(739)!;
const s2 = model.sprintById.get(743)!;

describe('reconstrucción del historial', () => {
  it('deshace los cambios de sprint', () => {
    const t = (iso: string) => Date.parse(iso);
    expect(sprintsAt(model, 'SGCC-8', t('2026-10-26T12:00:00Z'))).toEqual([]);
    expect(sprintsAt(model, 'SGCC-8', t('2026-11-06T12:44:20.448Z'))).toEqual([739]);
    expect(sprintsAt(model, 'SGCC-8', t('2026-11-06T13:00:00Z'))).toEqual([739, 743]);
  });

  it('deshace los cambios de estado', () => {
    const u = model.unitByKey.get('SGCC-10')!;
    expect(statusAt(model, u, Date.parse('2026-11-06T12:44:20.448Z'))).toBe('10216');
    expect(statusAt(model, u, Date.parse('2026-11-09T00:00:00Z'))).toBe('10219');
  });
});

describe('sprint cerrado con historial', () => {
  const m = sprintMetrics(model, s1);
  const join = Object.fromEntries(m.scope.map((s) => [s.unit.key, s.join]));
  const atClose = Object.fromEntries(m.scope.map((s) => [s.unit.key, s.categoryAtRef]));

  it('el alcance son las UE presentes al cierre, sin la historia padre', () => {
    expect(Object.keys(join).sort()).toEqual(['SGCC-10', 'SGCC-7', 'SGCC-9']);
    expect(m.mode).toBe('historial');
  });

  it('usa el estado al cierre: lo terminado después no cuenta en el sprint original', () => {
    expect(atClose).toEqual({ 'SGCC-7': 'COMPLETADA', 'SGCC-9': 'COMPLETADA', 'SGCC-10': 'POR_HACER' });
    expect(m.completed).toBe(2);
    expect(m.pct).toBeCloseTo((2 / 3) * 100);
  });

  it('separa las actividades retiradas o trasladadas durante el sprint', () => {
    expect(m.removed.map((r) => [r.unit.key, r.movedTo])).toEqual([['SGCC-21', [743]]]);
  });
});

describe('sprint activo con historial', () => {
  const m = sprintMetrics(model, s2);
  const byKey = Object.fromEntries(m.scope.map((s) => [s.unit.key, s]));

  it('distingue comprometidas, arrastradas y agregadas', () => {
    expect(byKey['SGCC-21'].join).toBe('comprometida');
    expect(byKey['SGCC-10'].join).toBe('arrastrada');
    expect(byKey['SGCC-10'].carriedFrom).toBe(739);
    expect(byKey['SGCC-20'].join).toBe('agregada');
    expect(byKey['SGCC-22'].join).toBe('agregada');
    expect([m.committed, m.carried, m.added]).toEqual([1, 1, 2]);
  });

  it('no cuenta lo que ya estaba completado al entrar', () => {
    expect(m.alreadyDone.map((u) => u.key)).toEqual(['SGCC-9']);
    expect(byKey['SGCC-9']).toBeUndefined();
  });

  it('calcula avance sobre el alcance y cumplimiento sobre el compromiso', () => {
    expect(m.total).toBe(4);
    expect(m.completed).toBe(1);
    expect(m.pct).toBe(25);
    // compromiso = SGCC-21 (pendiente) + SGCC-10 (completada)
    expect(m.commitmentPct).toBe(50);
  });

  it('respeta el filtro de unidades', () => {
    const only = sprintMetrics(model, s2, (u) => u.key === 'SGCC-20');
    expect(only.total).toBe(1);
  });
});

describe('sin historial (aproximado)', () => {
  const approx = buildModel(snapshot(
    issues.map((i) =>
      i.key === 'SGCC-10'
        ? { ...i, statusCategoryChanged: '2026-11-08T00:00:00.000Z' }
        : i.key === 'SGCC-9'
          ? { ...i, statusCategoryChanged: '2026-11-05T19:46:07.200Z' }
          : i.key === 'SGCC-7'
            ? { ...i, statusCategoryChanged: '2026-11-04T00:00:00.000Z' }
            : i,
    ),
    [S1, S2],
    null,
  ));

  it('no da por completado en el sprint lo que se terminó después del cierre', () => {
    const m = sprintMetrics(approx, approx.sprintById.get(739)!);
    expect(m.mode).toBe('aproximado');
    const atClose = Object.fromEntries(m.scope.map((s) => [s.unit.key, s.categoryAtRef]));
    expect(atClose['SGCC-10']).toBe('SIN_HISTORIAL');
    expect(atClose['SGCC-9']).toBe('COMPLETADA');
    expect(m.completed).toBe(2);
  });

  it('no cuenta dos veces una UE terminada en el sprint anterior y arrastrada con su historia', () => {
    const m = sprintMetrics(approx, approx.sprintById.get(743)!);
    expect(m.alreadyDone.map((u) => u.key)).toContain('SGCC-9');
    expect(m.scope.map((s) => s.unit.key)).toContain('SGCC-10');
  });
});

describe('sprint futuro', () => {
  it('muestra lo planificado con su estado actual', () => {
    const future = sprint({ id: 745, projectKey: 'SGCC', state: 'future' });
    const mdl = buildModel(snapshot([issue({ key: 'SGCC-50', sprintIds: [745] })], [future]));
    const m = sprintMetrics(mdl, mdl.sprintById.get(745)!);
    expect(m.mode).toBe('planificado');
    expect(m.total).toBe(1);
  });
});
