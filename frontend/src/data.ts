import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from './api';
import { applyFilterParam, clearFilterParams, filtersFromParams, type Filters } from './domain/filters';
import { buildModel, type Model } from './domain/model';

export const SNAPSHOT_KEY = ['snapshot'];

export function useSnapshot() {
  const query = useQuery({
    queryKey: SNAPSHOT_KEY,
    queryFn: api.snapshot,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const model = useMemo<Model | null>(() => (query.data ? buildModel(query.data) : null), [query.data]);
  return { ...query, model };
}

export function useRefresh() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.refresh,
    onSuccess: (snapshot) => client.setQueryData(SNAPSHOT_KEY, snapshot),
  });
}

/** Filtros guardados en la URL para que una vista filtrada pueda compartirse. */
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  /** Aplica varios cambios en una sola navegación (dos llamadas seguidas se pisarían). */
  const update = (patch: Partial<Filters>) =>
    setParams(
      (p) =>
        (Object.entries(patch) as [keyof Filters, Filters[keyof Filters]][]).reduce(
          (acc, [k, v]) => applyFilterParam(acc, k, v),
          p,
        ),
      { replace: true },
    );
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => update({ [key]: value } as Partial<Filters>);
  const clear = () => setParams((p) => clearFilterParams(p), { replace: true });
  return { filters, set, update, clear, params, setParams };
}
