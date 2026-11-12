import type { CategoryCounts } from './categories';
import { filterUnits, UNASSIGNED, type Filters } from './filters';
import { completedPct, countByCategory } from './metrics';
import type { Model, PersonInfo } from './model';

export interface PersonRow {
  id: string;
  name: string;
  role: string | null;
  focus: boolean;
  unassigned: boolean;
  total: number;
  counts: CategoryCounts;
  completedPct: number | null;
  /** Carga por proyecto: total y completadas. */
  byProject: Record<string, { total: number; completed: number }>;
}

/**
 * Carga y avance por responsable actual (campo Assignee de cada UE: la subtarea,
 * no su historia). El filtro de persona no se aplica aquí: la vista compara personas.
 *
 * Con `teamOnly`, solo aparecen las personas configuradas y la categoría Sin asignar.
 */
export function peopleRows(model: Model, f: Filters, teamOnly: boolean): PersonRow[] {
  const units = filterUnits(model, f, ['person']);
  const groups = new Map<string, typeof units>();
  for (const u of units) {
    const id = u.assignee?.accountId ?? UNASSIGNED;
    const list = groups.get(id) ?? [];
    list.push(u);
    groups.set(id, list);
  }

  const info = new Map<string, PersonInfo>(model.people.map((p) => [p.accountId, p]));
  const ids = new Set<string>(model.config.people.map((p) => p.accountId));
  if (!teamOnly) for (const id of groups.keys()) ids.add(id);
  ids.add(UNASSIGNED);

  const rows: PersonRow[] = [...ids].map((id) => {
    const list = groups.get(id) ?? [];
    const byProject: PersonRow['byProject'] = {};
    for (const p of model.projects) byProject[p.key] = { total: 0, completed: 0 };
    for (const u of list) {
      byProject[u.projectKey].total++;
      if (u.category === 'COMPLETADA') byProject[u.projectKey].completed++;
    }
    const person = info.get(id);
    return {
      id,
      name: id === UNASSIGNED ? 'Sin asignar' : person?.name ?? list[0]?.assignee?.displayName ?? id,
      role: person?.role ?? null,
      focus: person?.focus ?? false,
      unassigned: id === UNASSIGNED,
      total: list.length,
      counts: countByCategory(list),
      completedPct: completedPct(list),
      byProject,
    };
  });

  const configuredOrder = new Map(model.config.people.map((p, i) => [p.accountId, i]));
  const rank = (r: PersonRow) =>
    r.unassigned ? 3 : r.focus ? 0 : configuredOrder.has(r.id) ? 1 : 2;
  return rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (configuredOrder.get(a.id) ?? 0) - (configuredOrder.get(b.id) ?? 0) ||
      b.total - a.total ||
      a.name.localeCompare(b.name),
  );
}
