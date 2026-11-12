import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Category, DashboardConfig } from '../contract/snapshot';

const CATEGORIES: Category[] = [
  'POR_HACER',
  'EN_CURSO',
  'EN_REVISION',
  'VALIDACION_TECNICA',
  'COMPLETADA',
];

export class ConfigError extends Error {}

/** Valida la configuración y devuelve una copia con valores por defecto. */
export function validateConfig(raw: unknown): DashboardConfig {
  const errors: string[] = [];
  const c = (raw ?? {}) as Partial<DashboardConfig>;

  if (!Array.isArray(c.projects) || c.projects.length === 0) {
    errors.push('"projects" debe ser una lista con al menos un proyecto.');
  } else {
    c.projects.forEach((p, i) => {
      if (!p?.key) errors.push(`projects[${i}].key es obligatorio.`);
      if (!p?.label) errors.push(`projects[${i}].label es obligatorio.`);
      if (!Number.isInteger(p?.boardId))
        errors.push(`projects[${i}].boardId debe ser un número entero.`);
    });
  }

  const statusMap = c.statusMap ?? {};
  for (const [id, cat] of Object.entries(statusMap)) {
    if (!CATEGORIES.includes(cat)) {
      errors.push(
        `statusMap["${id}"] = "${cat}" no es una categoría válida (${CATEGORIES.join(', ')}).`,
      );
    }
  }

  const hide = c.hideEmptyCategories ?? [];
  hide.forEach((cat) => {
    if (!CATEGORIES.includes(cat))
      errors.push(`hideEmptyCategories contiene "${cat}", que no es una categoría válida.`);
  });

  if (!c.fields?.sprint || !c.fields?.startDate) {
    errors.push('"fields.sprint" y "fields.startDate" son obligatorios.');
  }

  const mode = c.duration?.mode ?? 'businessDays';
  if (mode !== 'businessDays' && mode !== 'calendarDays') {
    errors.push('"duration.mode" debe ser "businessDays" o "calendarDays".');
  }
  const holidays = c.duration?.holidays ?? [];
  holidays.forEach((h) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h))
      errors.push(`duration.holidays contiene "${h}"; usa el formato AAAA-MM-DD.`);
  });

  (c.people ?? []).forEach((p, i) => {
    if (!p?.accountId) errors.push(`people[${i}].accountId es obligatorio.`);
  });

  if (errors.length) {
    throw new ConfigError(`Configuración inválida:\n- ${errors.join('\n- ')}`);
  }

  return {
    projects: c.projects!,
    statusMap,
    hideEmptyCategories: hide,
    fields: c.fields!,
    duration: { mode, holidays },
    people: c.people ?? [],
  };
}

export function loadConfig(path?: string): DashboardConfig {
  // Por defecto, backend/dashboard.config.json (igual desde src/ o dist/), sin importar
  // desde qué carpeta se arranque el proceso.
  const file = resolve(path || process.env.DASHBOARD_CONFIG_PATH || join(__dirname, '../../dashboard.config.json'));
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new ConfigError(`No se encontró la configuración en ${file}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new ConfigError(`${file} no es JSON válido: ${(e as Error).message}`);
  }
  return validateConfig(parsed);
}
