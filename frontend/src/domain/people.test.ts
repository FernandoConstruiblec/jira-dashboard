import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS } from './filters';
import { buildModel } from './model';
import { peopleRows } from './people';
import { ANGEL, done, FERNANDO, issue, OTRO, PAMELA, snapshot } from './testkit';

const model = buildModel(
  snapshot([
    // La historia está asignada a Pamela, pero las UE son sus subtareas.
    issue({ key: 'CSE-714', assignee: PAMELA }),
    issue({ key: 'CSE-715', level: 'subtask', parentKey: 'CSE-714', assignee: FERNANDO, ...done('CSE') }),
    issue({ key: 'CSE-716', level: 'subtask', parentKey: 'CSE-714', assignee: ANGEL }),
    issue({ key: 'SGCC-7', assignee: FERNANDO }),
    issue({ key: 'SGCC-8' }),
    issue({ key: 'CSE-1', assignee: OTRO, ...done('CSE') }),
  ]),
);

describe('avance por persona', () => {
  it('usa el responsable de cada UE y no el de la historia padre', () => {
    const rows = peopleRows(model, EMPTY_FILTERS, false);
    const pam = rows.find((r) => r.id === 'pam')!;
    expect(pam.total).toBe(0);
    const fer = rows.find((r) => r.id === 'fer')!;
    expect(fer.total).toBe(2);
    expect(fer.completedPct).toBe(50);
  });

  it('separa la carga por proyecto', () => {
    const fer = peopleRows(model, EMPTY_FILTERS, false).find((r) => r.id === 'fer')!;
    expect(fer.byProject).toEqual({ SGCC: { total: 1, completed: 0 }, CSE: { total: 1, completed: 1 } });
  });

  it('muestra las actividades sin asignar en su propia fila', () => {
    const rows = peopleRows(model, EMPTY_FILTERS, false);
    expect(rows.at(-1)).toMatchObject({ unassigned: true, total: 1, name: 'Sin asignar' });
  });

  it('ordena primero a las personas destacadas y luego al resto del equipo', () => {
    const names = peopleRows(model, EMPTY_FILTERS, false).map((r) => r.id);
    expect(names).toEqual(['fer', 'ang', 'pam', 'otro', 'unassigned']);
  });

  it('con "solo equipo" oculta a quienes no están configurados', () => {
    const ids = peopleRows(model, EMPTY_FILTERS, true).map((r) => r.id);
    expect(ids).toEqual(['fer', 'ang', 'pam', 'unassigned']);
  });

  it('el total por persona más sin asignar es igual al total de UE', () => {
    const rows = peopleRows(model, EMPTY_FILTERS, false);
    expect(rows.reduce((a, r) => a + r.total, 0)).toBe(model.units.length);
  });
});
