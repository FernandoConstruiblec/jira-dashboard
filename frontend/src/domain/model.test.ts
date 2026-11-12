import { describe, expect, it } from 'vitest';
import { durationDays } from './dates';
import { buildModel } from './model';
import { epic, issue, snapshot, sprint } from './testkit';

describe('unidades de ejecución', () => {
  const model = buildModel(
    snapshot(
      [
        epic('SGCC-1', '2026-10-29', '2026-11-06'),
        issue({ key: 'SGCC-7', parentKey: 'SGCC-1' }),
        issue({ key: 'SGCC-8', parentKey: 'SGCC-1', sprintIds: [739] }),
        issue({ key: 'SGCC-9', level: 'subtask', parentKey: 'SGCC-8', sprintIds: [739] }),
        issue({ key: 'SGCC-10', level: 'subtask', parentKey: 'SGCC-8', sprintIds: [739] }),
        epic('CSE-670', null, null),
        // En el Prototipo las tareas también tienen subtareas.
        issue({ key: 'CSE-714', typeName: 'Tarea', parentKey: 'CSE-670' }),
        issue({ key: 'CSE-715', level: 'subtask', parentKey: 'CSE-714' }),
        issue({ key: 'CSE-1', typeName: 'Error' }),
      ],
      [sprint({ id: 739, projectKey: 'SGCC' })],
    ),
  );
  const keys = model.units.map((u) => u.key);

  it('usa las subtareas cuando existen y la historia cuando no', () => {
    expect(keys).toContain('SGCC-7');
    expect(keys).toContain('SGCC-9');
    expect(keys).toContain('SGCC-10');
    expect(keys).not.toContain('SGCC-8');
  });

  it('trata igual a tareas y errores', () => {
    expect(keys).toContain('CSE-715');
    expect(keys).not.toContain('CSE-714');
    expect(keys).toContain('CSE-1');
  });

  it('no cuenta épicos como actividades', () => {
    expect(keys).not.toContain('SGCC-1');
    expect(model.units).toHaveLength(5);
  });

  it('las subtareas heredan el épico y la pertenencia a sprint del padre', () => {
    const st = model.unitByKey.get('SGCC-9')!;
    expect(st.epicKey).toBe('SGCC-1');
    expect(st.membershipKey).toBe('SGCC-8');
    expect(model.unitByKey.get('CSE-715')!.epicKey).toBe('CSE-670');
    expect(model.unitByKey.get('CSE-1')!.epicKey).toBeNull();
  });

  it('enlaza cada épico con sus unidades', () => {
    expect(model.epicByKey.get('SGCC-1')!.unitKeys).toEqual(['SGCC-7', 'SGCC-9', 'SGCC-10']);
  });
});

describe('exclusiones', () => {
  const model = buildModel(
    snapshot(
      [
        epic('CSE-90', '2026-02-18', '2026-03-01'),
        issue({ key: 'CSE-91', parentKey: 'CSE-90', sprintIds: [201] }),
        issue({ key: 'CSE-92', sprintIds: [201] }),
        issue({ key: 'CSE-93', sprintIds: [201, 102] }),
        issue({ key: 'CSE-94' }),
      ],
      [
        sprint({ id: 201, projectKey: 'CSE', name: 'Sprint IoT-1' }),
        sprint({ id: 102, projectKey: 'CSE', name: 'Sprint 1' }),
      ],
    ),
  );

  it('excluye los épicos configurados con todo lo que cuelga de ellos', () => {
    expect(model.epicByKey.has('CSE-90')).toBe(false);
    expect(model.unitByKey.has('CSE-91')).toBe(false);
  });

  it('excluye actividades sin épico que solo estuvieron en sprints excluidos', () => {
    expect(model.unitByKey.has('CSE-92')).toBe(false);
    expect(model.unitByKey.has('CSE-93')).toBe(true);
    expect(model.unitByKey.get('CSE-93')!.sprintIds).toEqual([102]);
    expect(model.unitByKey.has('CSE-94')).toBe(true);
  });

  it('excluye los sprints que coinciden con el patrón', () => {
    expect(model.sprints.map((s) => s.id)).toEqual([102]);
    expect(model.excluded).toEqual({ issues: 2, epics: 1, sprints: 1 });
  });
});

describe('estados', () => {
  it('mapea por ID de estado y marca los no configurados', () => {
    const model = buildModel(
      snapshot([
        issue({ key: 'CSE-1', statusId: '10183', statusName: 'Validaciòn Tècnica' }),
        issue({ key: 'CSE-2', statusId: '99999', statusName: 'Bloqueada' }),
      ]),
    );
    expect(model.unitByKey.get('CSE-1')!.category).toBe('VALIDACION_TECNICA');
    expect(model.unitByKey.get('CSE-2')!.category).toBe('SIN_MAPEAR');
    expect(model.unmappedStatuses).toEqual([{ projectKey: 'CSE', statusId: '99999', statusName: 'Bloqueada', units: 1 }]);
  });
});

describe('duración de épicos', () => {
  it('cuenta días hábiles incluyendo inicio y fin', () => {
    // jue 29-oct a vie 6-nov 2026
    expect(durationDays('2026-10-29', '2026-11-06', 'businessDays')).toBe(7);
    expect(durationDays('2026-10-29', '2026-11-06', 'calendarDays')).toBe(9);
  });

  it('descuenta feriados configurados', () => {
    expect(durationDays('2026-10-29', '2026-11-06', 'businessDays', ['2026-11-02', '2026-11-03'])).toBe(5);
  });

  it('no inventa duración si falta una fecha o están invertidas', () => {
    expect(durationDays(null, '2026-11-06', 'businessDays')).toBeNull();
    expect(durationDays('2026-11-06', null, 'businessDays')).toBeNull();
    expect(durationDays('2026-11-06', '2026-11-01', 'businessDays')).toBeNull();
  });

  it('marca el motivo cuando un épico no tiene duración', () => {
    const model = buildModel(
      snapshot([
        epic('SGCC-1', null, null),
        epic('SGCC-2', '2026-11-01', null),
        epic('SGCC-3', '2026-11-09', '2026-11-01'),
      ]),
    );
    expect(model.epics.map((e) => e.durationIssue)).toEqual(['sin-fechas', 'solo-inicio', 'fechas-invertidas']);
  });
});
