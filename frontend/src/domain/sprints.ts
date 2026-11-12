import { categorize, emptyCounts, type AnyCategory, type CategoryCounts } from './categories';
import type { Model, SprintInfo, Unit } from './model';

/**
 * Cómo entró una actividad al sprint:
 * - comprometida: estaba en el sprint al iniciarlo.
 * - arrastrada: entró después del inicio porque se cerró el sprint anterior con ella
 *   pendiente (Jira la mueve al cerrar). Cuenta como parte del compromiso.
 * - agregada: se incorporó después del inicio por otra razón.
 */
export type JoinKind = 'comprometida' | 'arrastrada' | 'agregada';

export interface SprintUnit {
  unit: Unit;
  join: JoinKind;
  joinedAt: number;
  /** Sprint anterior del mismo proyecto del que venía pendiente. */
  carriedFrom: number | null;
  /** Estado en la fecha de referencia (cierre o ahora). */
  categoryAtRef: AnyCategory;
}

export interface RemovedUnit {
  unit: Unit;
  leftAt: number | null;
  /** Sprint al que pasó, si se movió a otro. */
  movedTo: number[];
}

export type SprintMode = 'historial' | 'aproximado' | 'planificado';

export interface SprintMetrics {
  sprint: SprintInfo;
  mode: SprintMode;
  /** Momento al que se refieren los estados: cierre del sprint, ahora o null (futuro). */
  refTime: number | null;
  scope: SprintUnit[];
  removed: RemovedUnit[];
  /** Ya estaban completadas cuando entraron: no se cuentan en el sprint. */
  alreadyDone: Unit[];
  counts: CategoryCounts;
  total: number;
  completed: number;
  pct: number | null;
  committed: number;
  carried: number;
  added: number;
  /** Compromiso = comprometidas + arrastradas. */
  commitmentCompleted: number;
  commitmentPct: number | null;
}

/** Tolerancia para reconocer el movimiento que hace Jira al cerrar un sprint. */
const CARRY_WINDOW_MS = 10 * 60_000;

const parseIds = (value: string | null): number[] =>
  value
    ? value
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];

/** Sprints a los que pertenecía `issueKey` en el instante t, deshaciendo el historial. */
export function sprintsAt(model: Model, issueKey: string, t: number): number[] {
  const issue = model.issueByKey.get(issueKey);
  if (!issue || t < Date.parse(issue.created)) return [];
  let ids = issue.sprintIds;
  const events = model.history?.get(issueKey) ?? [];
  for (let i = events.length - 1; i >= 0 && events[i].time > t; i--) {
    if (events[i].field === 'sprint') ids = parseIds(events[i].from);
  }
  return ids;
}

/** ID de estado de la unidad en el instante t, deshaciendo el historial. */
export function statusAt(model: Model, unit: Unit, t: number): string {
  let status = unit.statusId;
  const events = model.history?.get(unit.key) ?? [];
  for (let i = events.length - 1; i >= 0 && events[i].time > t; i--) {
    if (events[i].field === 'status' && events[i].from) status = events[i].from!;
  }
  return status;
}

function sprintRefTime(sprint: SprintInfo, now: number): number | null {
  if (sprint.state === 'future' || !sprint.startDate) return null;
  if (sprint.state === 'active') return now;
  return Date.parse(sprint.completeDate ?? sprint.endDate ?? sprint.startDate);
}

/** El sprint cerrado más reciente del mismo proyecto entre `ids`, cerrado cerca de (o antes de) t. */
function closedSprintNear(model: Model, sprint: SprintInfo, ids: number[], t: number, window: 'before' | 'near'): number | null {
  let best: { id: number; closed: number } | null = null;
  for (const id of ids) {
    if (id === sprint.id) continue;
    const other = model.sprintById.get(id);
    if (!other || other.projectKey !== sprint.projectKey || other.state !== 'closed' || !other.completeDate) continue;
    const closed = Date.parse(other.completeDate);
    const ok = window === 'near' ? Math.abs(closed - t) <= CARRY_WINDOW_MS : closed <= t + CARRY_WINDOW_MS;
    if (ok && (!best || closed > best.closed)) best = { id, closed };
  }
  return best?.id ?? null;
}

function summarize(sprint: SprintInfo, mode: SprintMode, refTime: number | null, scope: SprintUnit[], removed: RemovedUnit[], alreadyDone: Unit[]): SprintMetrics {
  const counts = emptyCounts();
  for (const s of scope) counts[s.categoryAtRef]++;
  const done = (s: SprintUnit) => s.categoryAtRef === 'COMPLETADA';
  const commitment = scope.filter((s) => s.join !== 'agregada');
  return {
    sprint,
    mode,
    refTime,
    scope,
    removed,
    alreadyDone,
    counts,
    total: scope.length,
    completed: counts.COMPLETADA,
    pct: scope.length ? (counts.COMPLETADA / scope.length) * 100 : null,
    committed: scope.filter((s) => s.join === 'comprometida').length,
    carried: scope.filter((s) => s.join === 'arrastrada').length,
    added: scope.filter((s) => s.join === 'agregada').length,
    commitmentCompleted: commitment.filter(done).length,
    commitmentPct: commitment.length ? (commitment.filter(done).length / commitment.length) * 100 : null,
  };
}

/**
 * Métricas de un sprint sobre las unidades de ejecución que pasan `include`.
 *
 * Con historial de Jira se reconstruye la pertenencia y el estado de cada UE en el
 * inicio y en el cierre del sprint. Una UE trasladada a otro sprint sin terminar
 * cuenta como no completada en el sprint original, aunque hoy esté terminada.
 */
export function sprintMetrics(model: Model, sprint: SprintInfo, include: (u: Unit) => boolean = () => true): SprintMetrics {
  const refTime = sprintRefTime(sprint, model.generatedAt);
  const candidates = model.units.filter((u) => include(u));

  if (refTime === null) {
    const scope: SprintUnit[] = candidates
      .filter((u) => u.sprintIds.includes(sprint.id))
      .map((u) => ({ unit: u, join: 'comprometida', joinedAt: u.created, carriedFrom: null, categoryAtRef: u.category }));
    return summarize(sprint, 'planificado', null, scope, [], []);
  }

  const start = Date.parse(sprint.startDate!);
  return model.history
    ? withHistory(model, sprint, candidates, start, refTime)
    : approximate(model, sprint, candidates, start, refTime);
}

function withHistory(model: Model, sprint: SprintInfo, units: Unit[], start: number, ref: number): SprintMetrics {
  const scope: SprintUnit[] = [];
  const removed: RemovedUnit[] = [];
  const alreadyDone: Unit[] = [];

  for (const u of units) {
    const memberAt = (t: number) => t >= u.created && sprintsAt(model, u.membershipKey, t).includes(sprint.id);

    // Momentos en que la pertenencia pudo cambiar dentro de la ventana del sprint.
    const times = (model.history!.get(u.membershipKey) ?? [])
      .filter((e) => e.field === 'sprint' && e.time > start && e.time <= ref)
      .map((e) => e.time);
    if (u.created > start && u.created <= ref) times.push(u.created);
    times.sort((a, b) => a - b);

    const atStart = memberAt(start);
    const atRef = memberAt(ref);
    let joinedAt: number | null = atStart ? start : null;
    let leftAt: number | null = null;
    let prev = atStart;
    for (const t of times) {
      const now = memberAt(t);
      if (now && joinedAt === null) joinedAt = t;
      if (prev && !now) leftAt = t;
      prev = now;
    }
    if (joinedAt === null) continue; // nunca estuvo en el sprint

    if (!atRef) {
      const after = leftAt !== null ? sprintsAt(model, u.membershipKey, leftAt) : [];
      removed.push({ unit: u, leftAt, movedTo: after.filter((id) => id !== sprint.id) });
      continue;
    }

    if (categorize(statusAt(model, u, joinedAt), model.config) === 'COMPLETADA') {
      alreadyDone.push(u);
      continue;
    }

    let join: JoinKind = 'comprometida';
    let carriedFrom: number | null = null;
    if (atStart) {
      carriedFrom = closedSprintNear(model, sprint, sprintsAt(model, u.membershipKey, start), start, 'before');
    } else {
      carriedFrom = closedSprintNear(model, sprint, sprintsAt(model, u.membershipKey, joinedAt - 1), joinedAt, 'near');
      join = carriedFrom !== null ? 'arrastrada' : 'agregada';
    }

    scope.push({
      unit: u,
      join,
      joinedAt,
      carriedFrom,
      categoryAtRef: categorize(statusAt(model, u, ref), model.config),
    });
  }

  return summarize(sprint, 'historial', ref, scope, removed, alreadyDone);
}

/**
 * Sin historial: la pertenencia es la del campo Sprint actual y el estado al cierre
 * solo se conoce si no cambió de categoría después del cierre.
 */
function approximate(model: Model, sprint: SprintInfo, units: Unit[], start: number, ref: number): SprintMetrics {
  const scope: SprintUnit[] = [];
  const alreadyDone: Unit[] = [];
  const isClosed = sprint.state === 'closed';

  for (const u of units) {
    if (!u.sprintIds.includes(sprint.id) || u.created > ref) continue;
    const changed = u.statusCategoryChanged;
    if (u.category === 'COMPLETADA' && changed !== null) {
      // Terminada antes de entrar, o dentro de un sprint anterior que la incluía
      // (p. ej. una subtarea cuya historia se arrastró): el logro es de ese sprint.
      const earlierOwner = u.sprintIds.some((id) => {
        const p = model.sprintById.get(id);
        if (!p || id === sprint.id || p.state !== 'closed' || !p.startDate || !p.completeDate) return false;
        return Date.parse(p.startDate) < start && changed <= Date.parse(p.completeDate);
      });
      if (changed < Math.max(start, u.created) || earlierOwner) {
        alreadyDone.push(u);
        continue;
      }
    }
    let categoryAtRef: AnyCategory = u.category;
    if (isClosed && changed !== null && changed > ref) categoryAtRef = 'SIN_HISTORIAL';

    const atStart = u.created <= start;
    scope.push({
      unit: u,
      join: atStart ? 'comprometida' : 'agregada',
      joinedAt: atStart ? start : u.created,
      carriedFrom: closedSprintNear(model, sprint, u.sprintIds, start, 'before'),
      categoryAtRef,
    });
  }

  return summarize(sprint, 'aproximado', ref, scope, [], alreadyDone);
}

export interface ProjectSprintSummary {
  projectKey: string;
  label: string;
  closedSprints: number;
  /** Promedio simple del avance de los sprints cerrados. */
  avgPct: number | null;
  /** Avance agregado: completadas / alcance de todos los sprints cerrados. */
  pooledPct: number | null;
}

export function projectSprintSummaries(model: Model, metrics: SprintMetrics[]): ProjectSprintSummary[] {
  return model.projects.map((p) => {
    const closed = metrics.filter((m) => m.sprint.projectKey === p.key && m.sprint.state === 'closed' && m.pct !== null);
    const total = closed.reduce((a, m) => a + m.total, 0);
    const done = closed.reduce((a, m) => a + m.completed, 0);
    return {
      projectKey: p.key,
      label: p.label,
      closedSprints: closed.length,
      avgPct: closed.length ? closed.reduce((a, m) => a + m.pct!, 0) / closed.length : null,
      pooledPct: total ? (done / total) * 100 : null,
    };
  });
}
