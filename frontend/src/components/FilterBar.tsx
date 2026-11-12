import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { CATEGORY_LABEL, CATEGORY_ORDER, type UnitCategory } from '../domain/categories';
import { NONE, UNASSIGNED, type Filters } from '../domain/filters';
import type { Model } from '../domain/model';
import { useFilters } from '../data';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
      {label}
      {children}
    </label>
  );
}

/** Una fila de filtros sobre el contenido; todo lo de abajo responde a ellos. */
export function FilterBar({ model, hide = [] }: { model: Model; hide?: (keyof Filters)[] }) {
  const { filters, set, update, clear } = useFilters();
  const projects = model.projects.filter((p) => !filters.project || p.key === filters.project);
  const active = (Object.keys(filters) as (keyof Filters)[]).some((k) => !hide.includes(k) && filters[k] !== null);

  const categories = CATEGORY_ORDER.filter(
    (c) =>
      c !== 'SIN_HISTORIAL' &&
      (!(model.config.hideEmptyCategories as string[]).includes(c) || model.units.some((u) => u.category === c)) &&
      (c !== 'SIN_MAPEAR' || model.unmappedStatuses.length > 0),
  ) as UnitCategory[];

  const sprintValue = filters.sprint === null ? '' : String(filters.sprint);

  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-3 sm:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
      {!hide.includes('project') && (
        <Field label="Proyecto">
          <select
            className="control"
            value={filters.project ?? ''}
            onChange={(e) => {
              const value = e.target.value || null;
              const patch: Partial<Filters> = { project: value };
              // Sprint y épico pertenecen a un proyecto: se limpian si dejan de aplicar.
              if (value && typeof filters.sprint === 'number' && model.sprintById.get(filters.sprint)?.projectKey !== value) patch.sprint = null;
              if (value && filters.epic && filters.epic !== NONE && model.epicByKey.get(filters.epic)?.projectKey !== value) patch.epic = null;
              update(patch);
            }}
          >
            <option value="">Ambos proyectos</option>
            {model.projects.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label} ({p.key})
              </option>
            ))}
          </select>
        </Field>
      )}

      {!hide.includes('sprint') && (
        <Field label="Sprint">
          <select
            className="control"
            value={sprintValue}
            onChange={(e) => set('sprint', e.target.value === '' ? null : e.target.value === NONE ? NONE : Number(e.target.value))}
          >
            <option value="">Todos</option>
            <option value={NONE}>Sin sprint</option>
            {projects.map((p) => (
              <optgroup key={p.key} label={p.label}>
                {model.sprints
                  .filter((s) => s.projectKey === p.key)
                  .slice()
                  .reverse()
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.state === 'active' ? ' (activo)' : s.state === 'future' ? ' (futuro)' : ''}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
      )}

      {!hide.includes('person') && (
        <Field label="Persona">
          <select className="control" value={filters.person ?? ''} onChange={(e) => set('person', e.target.value || null)}>
            <option value="">Todas</option>
            {model.people.map((p) => (
              <option key={p.accountId} value={p.accountId}>
                {p.name}
                {p.role ? ` · ${p.role}` : ''}
              </option>
            ))}
            <option value={UNASSIGNED}>Sin asignar</option>
          </select>
        </Field>
      )}

      {!hide.includes('category') && (
        <Field label="Estado">
          <select
            className="control"
            value={filters.category ?? ''}
            onChange={(e) => set('category', (e.target.value || null) as UnitCategory | null)}
          >
            <option value="">Todos</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
      )}

      {!hide.includes('epic') && (
        <Field label="Épico">
          <select className="control" value={filters.epic ?? ''} onChange={(e) => set('epic', e.target.value || null)}>
            <option value="">Todos</option>
            <option value={NONE}>Sin épico</option>
            {projects.map((p) => (
              <optgroup key={p.key} label={p.label}>
                {model.epics
                  .filter((e) => e.projectKey === p.key)
                  .map((e) => (
                    <option key={e.key} value={e.key}>
                      {e.key} · {e.summary}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
      )}

      <button
        type="button"
        onClick={clear}
        disabled={!active}
        className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-40 sm:col-span-1 lg:self-end"
      >
        <X size={14} aria-hidden /> Limpiar
      </button>
    </div>
  );
}
