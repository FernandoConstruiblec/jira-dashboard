import type { UnitCategory } from './categories';
import type { Epic, Model, Unit } from './model';

export const NONE = 'none';
export const UNASSIGNED = 'unassigned';

export interface Filters {
  /** Clave de proyecto; null = ambos (vista consolidada). */
  project: string | null;
  /** ID de sprint, 'none' = sin sprint, null = todos. */
  sprint: number | typeof NONE | null;
  /** accountId, 'unassigned', null = todos. */
  person: string | null;
  category: UnitCategory | null;
  /** Clave de épico, 'none' = sin épico, null = todos. */
  epic: string | null;
}

export const EMPTY_FILTERS: Filters = { project: null, sprint: null, person: null, category: null, epic: null };

/** Filtros que eligen actividades dentro de un épico (no épicos completos). */
export function hasUnitLevelFilter(f: Filters): boolean {
  return f.sprint !== null || f.person !== null || f.category !== null;
}

export function epicMatches(e: Epic, f: Filters): boolean {
  if (f.project && e.projectKey !== f.project) return false;
  if (f.epic === NONE) return false;
  if (f.epic && e.key !== f.epic) return false;
  return true;
}

export function unitMatches(u: Unit, f: Filters, omit: (keyof Filters)[] = []): boolean {
  const use = (k: keyof Filters) => !omit.includes(k) && f[k] !== null;
  if (use('project') && u.projectKey !== f.project) return false;
  if (use('epic')) {
    if (f.epic === NONE ? u.epicKey !== null : u.epicKey !== f.epic) return false;
  }
  if (use('sprint')) {
    if (f.sprint === NONE ? u.sprintIds.length > 0 : !u.sprintIds.includes(f.sprint as number)) return false;
  }
  if (use('person')) {
    if (f.person === UNASSIGNED ? u.assignee !== null : u.assignee?.accountId !== f.person) return false;
  }
  if (use('category') && u.category !== f.category) return false;
  return true;
}

export function filterUnits(model: Model, f: Filters, omit: (keyof Filters)[] = []): Unit[] {
  return model.units.filter((u) => unitMatches(u, f, omit));
}

// --- Serialización en la URL ------------------------------------------------

const PARAM: Record<keyof Filters, string> = {
  project: 'proyecto',
  sprint: 'sprint',
  person: 'persona',
  category: 'estado',
  epic: 'epico',
};

export function filtersFromParams(params: URLSearchParams): Filters {
  const sprint = params.get(PARAM.sprint);
  return {
    project: params.get(PARAM.project),
    sprint: sprint === null ? null : sprint === NONE ? NONE : Number.isFinite(Number(sprint)) ? Number(sprint) : null,
    person: params.get(PARAM.person),
    category: (params.get(PARAM.category) as UnitCategory | null) ?? null,
    epic: params.get(PARAM.epic),
  };
}

export function applyFilterParam(
  params: URLSearchParams,
  key: keyof Filters,
  value: Filters[keyof Filters],
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === null || value === '') next.delete(PARAM[key]);
  else next.set(PARAM[key], String(value));
  return next;
}

export function clearFilterParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  Object.values(PARAM).forEach((p) => next.delete(p));
  return next;
}
