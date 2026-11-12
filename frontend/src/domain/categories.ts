import type { Category, DashboardConfig } from './contract';

/** Categoría de una unidad de ejecución según su estado actual. */
export type UnitCategory = Category | 'SIN_MAPEAR';

/**
 * En la vista de sprints, el estado al cierre puede ser desconocido cuando no hay
 * historial de Jira: se muestra aparte en lugar de suponerlo.
 */
export type AnyCategory = UnitCategory | 'SIN_HISTORIAL';

/** Orden de apilado y de leyenda: de lo terminado a lo pendiente. */
export const CATEGORY_ORDER: AnyCategory[] = [
  'COMPLETADA',
  'VALIDACION_TECNICA',
  'EN_REVISION',
  'EN_CURSO',
  'POR_HACER',
  'SIN_MAPEAR',
  'SIN_HISTORIAL',
];

export const CATEGORY_LABEL: Record<AnyCategory, string> = {
  COMPLETADA: 'Completadas',
  VALIDACION_TECNICA: 'Validación técnica',
  EN_REVISION: 'En revisión',
  EN_CURSO: 'En curso',
  POR_HACER: 'Por hacer',
  SIN_MAPEAR: 'Estado sin mapear',
  SIN_HISTORIAL: 'Estado al cierre desconocido',
};

/** Categorías que existen solo como aviso de calidad de datos. */
const ANOMALIES: AnyCategory[] = ['SIN_MAPEAR', 'SIN_HISTORIAL'];

export type CategoryCounts = Record<AnyCategory, number>;

export function emptyCounts(): CategoryCounts {
  return Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as CategoryCounts;
}

export function categorize(statusId: string, config: DashboardConfig): UnitCategory {
  return config.statusMap[statusId] ?? 'SIN_MAPEAR';
}

/**
 * Categorías a mostrar para un conjunto de conteos. Las configuradas como ocultas
 * (p. ej. Validación técnica, que hoy no se usa) y las de anomalía aparecen solo si
 * tienen actividades. `always` fuerza las que deben verse aunque estén vacías.
 */
export function visibleCategories(
  counts: CategoryCounts[],
  config: DashboardConfig,
): AnyCategory[] {
  return CATEGORY_ORDER.filter((c) => {
    const hasAny = counts.some((k) => k[c] > 0);
    if (ANOMALIES.includes(c)) return hasAny;
    if (config.hideEmptyCategories.includes(c as Category)) return hasAny;
    return true;
  });
}
