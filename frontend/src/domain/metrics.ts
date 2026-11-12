import { emptyCounts, type CategoryCounts } from './categories';
import { epicMatches, filterUnits, hasUnitLevelFilter, NONE, unitMatches, type Filters } from './filters';
import type { Epic, Model, Unit } from './model';

export function countByCategory(units: Unit[]): CategoryCounts {
  const counts = emptyCounts();
  for (const u of units) counts[u.category]++;
  return counts;
}

/** % de actividades completadas (por cantidad). null si no hay actividades. */
export function completedPct(units: Unit[]): number | null {
  if (units.length === 0) return null;
  return (units.filter((u) => u.category === 'COMPLETADA').length / units.length) * 100;
}

export interface WeightedProgress {
  pct: number | null;
  /** Motivo cuando pct es null. */
  reason: string | null;
  completedWeight: number;
  totalWeight: number;
  /** Épicos de la selección con duración, que aportan peso. */
  epicsCounted: number;
  epicsWithoutDuration: Epic[];
  /** Épicos con duración pero sin historias ni subtareas: pesan y aportan 0 %. */
  epicsPendingDecomposition: Epic[];
  /** Actividades de la selección sin épico: se cuentan pero no tienen peso. */
  unitsWithoutEpic: number;
}

/**
 * Avance ponderado por duración de épicos (ponderación provisional equitativa).
 *
 * peso(UE) = duración del épico / nº de UE del épico
 * avance   = Σ peso de UE completadas / Σ peso de la selección × 100
 *
 * El peso se reparte siempre sobre el épico completo; los filtros de sprint y persona
 * solo eligen qué UE se suman. Un épico sin UE pesa su duración completa con 0 %
 * mientras no se filtre por actividades.
 */
export function weightedProgress(model: Model, f: Filters): WeightedProgress {
  const unitsWithoutEpic = filterUnits(model, { ...f, epic: NONE }, []).length;
  const base: WeightedProgress = {
    pct: null,
    reason: null,
    completedWeight: 0,
    totalWeight: 0,
    epicsCounted: 0,
    epicsWithoutDuration: [],
    epicsPendingDecomposition: [],
    unitsWithoutEpic: f.epic && f.epic !== NONE ? 0 : unitsWithoutEpic,
  };

  if (f.category) {
    return { ...base, reason: 'No aplica con filtro de estado: el avance compara completadas contra el total.' };
  }
  if (f.epic === NONE) {
    return { ...base, reason: 'Las actividades sin épico no tienen peso de duración.' };
  }

  const unitFilter = hasUnitLevelFilter(f);
  const epics = model.epics.filter((e) => epicMatches(e, f));

  for (const epic of epics) {
    if (epic.duration === null) {
      base.epicsWithoutDuration.push(epic);
      continue;
    }
    if (epic.unitKeys.length === 0) {
      base.epicsPendingDecomposition.push(epic);
      if (!unitFilter) {
        base.totalWeight += epic.duration;
        base.epicsCounted++;
      }
      continue;
    }
    const weight = epic.duration / epic.unitKeys.length;
    let counted = false;
    for (const key of epic.unitKeys) {
      const u = model.unitByKey.get(key)!;
      if (!unitMatches(u, f)) continue;
      counted = true;
      base.totalWeight += weight;
      if (u.category === 'COMPLETADA') base.completedWeight += weight;
    }
    if (counted) base.epicsCounted++;
  }

  if (base.totalWeight > 0) {
    return { ...base, pct: (base.completedWeight / base.totalWeight) * 100 };
  }
  let reason: string;
  if (epics.length === 0) reason = 'No hay épicos en la selección.';
  else if (base.epicsWithoutDuration.length === epics.length)
    reason = 'Ningún épico de la selección tiene fecha de inicio y de vencimiento.';
  else reason = 'Las actividades seleccionadas no pertenecen a épicos con duración.';
  return { ...base, reason };
}

export interface Overview {
  units: Unit[];
  counts: CategoryCounts;
  total: number;
  completed: number;
  completedPct: number | null;
  weighted: WeightedProgress;
}

export function overview(model: Model, f: Filters): Overview {
  const units = filterUnits(model, f);
  const counts = countByCategory(units);
  return {
    units,
    counts,
    total: units.length,
    completed: counts.COMPLETADA,
    completedPct: completedPct(units),
    weighted: weightedProgress(model, f),
  };
}

export interface ProjectRow extends Overview {
  key: string;
  label: string;
  name: string;
}

/** Un resumen por proyecto con los mismos filtros (respetando el filtro de proyecto). */
export function projectRows(model: Model, f: Filters): ProjectRow[] {
  return model.projects
    .filter((p) => !f.project || p.key === f.project)
    .map((p) => ({ ...p, ...overview(model, { ...f, project: p.key }) }));
}

export interface EpicRow {
  epic: Epic;
  label: string;
  units: number;
  completed: number;
  completedPct: number | null;
  /** Peso en días de las UE de la selección. */
  weightShown: number | null;
  state: 'ok' | 'sin-duracion' | 'pendiente-descomposicion';
}

export function epicRows(model: Model, f: Filters): EpicRow[] {
  const label = new Map(model.projects.map((p) => [p.key, p.label]));
  return model.epics
    .filter((e) => epicMatches(e, f))
    .map((epic) => {
      const units = epic.unitKeys.map((k) => model.unitByKey.get(k)!).filter((u) => unitMatches(u, f));
      const completed = units.filter((u) => u.category === 'COMPLETADA').length;
      return {
        epic,
        label: label.get(epic.projectKey) ?? epic.projectKey,
        units: units.length,
        completed,
        completedPct: completedPct(units),
        weightShown:
          epic.duration === null
            ? null
            : epic.unitKeys.length === 0
              ? epic.duration
              : (epic.duration / epic.unitKeys.length) * units.length,
        state:
          epic.duration === null ? 'sin-duracion' : epic.unitKeys.length === 0 ? 'pendiente-descomposicion' : 'ok',
      } satisfies EpicRow;
    })
    .filter((r) => !hasUnitLevelFilter(f) || r.units > 0);
}
