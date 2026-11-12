import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS } from './filters';
import { epicRows, overview, projectRows, weightedProgress } from './metrics';
import { buildModel } from './model';
import { ANGEL, done, epic, FERNANDO, issue, snapshot, sprint } from './testkit';

// Épico A: 10 días hábiles (lun 2 a vie 13 de nov), 2 UE, 1 completada.
// Épico B: 4 días hábiles, sin historias -> pendiente de descomposición.
// Épico C: sin fechas -> fuera del ponderado.
// CSE-E: 5 días hábiles, 1 UE completada.
const model = buildModel(
  snapshot(
    [
      epic('SGCC-1', '2026-11-02', '2026-11-13'),
      issue({ key: 'SGCC-11', parentKey: 'SGCC-1', assignee: FERNANDO, sprintIds: [743], ...done('SGCC') }),
      issue({ key: 'SGCC-12', parentKey: 'SGCC-1', assignee: ANGEL, sprintIds: [743] }),
      epic('SGCC-2', '2026-11-16', '2026-11-19'),
      epic('SGCC-3', null, null),
      issue({ key: 'SGCC-31', parentKey: 'SGCC-3', assignee: FERNANDO, ...done('SGCC') }),
      issue({ key: 'SGCC-40', assignee: FERNANDO }),
      epic('CSE-1', '2026-11-02', '2026-11-06'),
      issue({ key: 'CSE-11', parentKey: 'CSE-1', assignee: ANGEL, ...done('CSE') }),
    ],
    [sprint({ id: 743, projectKey: 'SGCC', state: 'active' })],
  ),
);

describe('avance ponderado', () => {
  it('pondera por duración de épicos de ambos proyectos', () => {
    const w = weightedProgress(model, EMPTY_FILTERS);
    // completado: 10/2 (SGCC-11) + 5 (CSE-11) = 10; total: 10 + 4 + 5 = 19
    expect(w.completedWeight).toBe(10);
    expect(w.totalWeight).toBe(19);
    expect(w.pct).toBeCloseTo((10 / 19) * 100);
    expect(w.epicsWithoutDuration.map((e) => e.key)).toEqual(['SGCC-3']);
    expect(w.epicsPendingDecomposition.map((e) => e.key)).toEqual(['SGCC-2']);
    expect(w.unitsWithoutEpic).toBe(1);
  });

  it('se diferencia del porcentaje de actividades completadas', () => {
    const o = overview(model, EMPTY_FILTERS);
    expect(o.total).toBe(5);
    expect(o.completed).toBe(3);
    expect(o.completedPct).toBeCloseTo(60);
    expect(o.weighted.pct).not.toBeCloseTo(o.completedPct!);
  });

  it('con un solo proyecto usa solo sus épicos', () => {
    const w = weightedProgress(model, { ...EMPTY_FILTERS, project: 'CSE' });
    expect(w.pct).toBe(100);
    const kms = weightedProgress(model, { ...EMPTY_FILTERS, project: 'SGCC' });
    expect(kms.pct).toBeCloseTo((5 / 14) * 100);
  });

  it('con filtro de persona suma solo sus actividades, con el peso del épico completo', () => {
    const w = weightedProgress(model, { ...EMPTY_FILTERS, person: 'fer' });
    // Solo SGCC-11 (peso 5) tiene épico con duración; el épico pendiente no cuenta.
    expect(w.totalWeight).toBe(5);
    expect(w.pct).toBe(100);
  });

  it('no aplica con filtro de estado y explica por qué', () => {
    const w = weightedProgress(model, { ...EMPTY_FILTERS, category: 'COMPLETADA' });
    expect(w.pct).toBeNull();
    expect(w.reason).toMatch(/estado/);
  });

  it('indica cuando no puede calcularse', () => {
    const w = weightedProgress(model, { ...EMPTY_FILTERS, epic: 'SGCC-3' });
    expect(w.pct).toBeNull();
    expect(w.reason).toMatch(/fecha/);
  });
});

describe('consolidación', () => {
  it('la suma por proyecto es igual al consolidado (sin duplicados)', () => {
    const all = overview(model, EMPTY_FILTERS);
    const rows = projectRows(model, EMPTY_FILTERS);
    expect(rows.reduce((a, r) => a + r.total, 0)).toBe(all.total);
    expect(rows.reduce((a, r) => a + r.completed, 0)).toBe(all.completed);
  });

  it('la suma por estado es igual al total', () => {
    const o = overview(model, EMPTY_FILTERS);
    expect(Object.values(o.counts).reduce((a, n) => a + n, 0)).toBe(o.total);
  });

  it('filtra por sprint, persona, épico y sin épico', () => {
    expect(overview(model, { ...EMPTY_FILTERS, sprint: 743 }).total).toBe(2);
    expect(overview(model, { ...EMPTY_FILTERS, sprint: 'none' }).total).toBe(3);
    expect(overview(model, { ...EMPTY_FILTERS, person: 'ang' }).total).toBe(2);
    expect(overview(model, { ...EMPTY_FILTERS, epic: 'none' }).total).toBe(1);
  });
});

describe('tabla de épicos', () => {
  it('marca el estado de ponderación de cada épico', () => {
    const rows = epicRows(model, EMPTY_FILTERS);
    const state = Object.fromEntries(rows.map((r) => [r.epic.key, r.state]));
    expect(state).toEqual({
      'CSE-1': 'ok',
      'SGCC-1': 'ok',
      'SGCC-2': 'pendiente-descomposicion',
      'SGCC-3': 'sin-duracion',
    });
  });
});
