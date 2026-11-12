import type { AnyCategory } from './domain/categories';

export const CATEGORY_COLOR: Record<AnyCategory, string> = {
  COMPLETADA: 'var(--cat-completada)',
  VALIDACION_TECNICA: 'var(--cat-validacion)',
  EN_REVISION: 'var(--cat-revision)',
  EN_CURSO: 'var(--cat-curso)',
  POR_HACER: 'var(--cat-porhacer)',
  SIN_MAPEAR: 'var(--cat-sinmapear)',
  SIN_HISTORIAL: 'var(--cat-sinhistorial)',
};

const PROJECT_COLORS: Record<string, string> = {
  SGCC: 'var(--proj-kms)',
  CSE: 'var(--proj-prototipo)',
};

export function projectColor(key: string): string {
  return PROJECT_COLORS[key] ?? 'var(--muted)';
}
