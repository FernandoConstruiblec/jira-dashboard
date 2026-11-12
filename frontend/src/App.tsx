import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, saveToken, UnauthorizedError } from './api';
import { Badge, Notice } from './components/ui';
import { SNAPSHOT_KEY, useRefresh, useSnapshot } from './data';
import { formatDateTime } from './domain/dates';
import type { Model } from './domain/model';
import { ConfigView } from './views/ConfigView';
import { GlobalView } from './views/GlobalView';
import { PeopleView } from './views/PeopleView';
import { SprintsView } from './views/SprintsView';

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.login(password);
      saveToken(token);
      onDone();
    } catch (err) {
      setError(err instanceof UnauthorizedError ? 'Contraseña incorrecta.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6">
        <div>
          <h1 className="text-lg font-semibold">Seguimiento KMS y Prototipo</h1>
          <p className="text-sm text-ink-2">Ingresa la contraseña del equipo.</p>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          aria-label="Contraseña"
        />
        {error && <Notice tone="warn">{error}</Notice>}
        <button disabled={busy || !password} className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          Entrar
        </button>
      </form>
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Avance global' },
  { to: '/sprints', label: 'Sprints' },
  { to: '/personas', label: 'Personas' },
  { to: '/configuracion', label: 'Configuración' },
];

function Shell({ model, fetching }: { model: Model; fetching: boolean }) {
  const refresh = useRefresh();
  const location = useLocation();
  const issues = model.unmappedStatuses.length + model.warnings.length;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Seguimiento de proyectos</h1>
          <p className="text-xs text-ink-2">
            {model.projects.map((p) => `${p.label} (${p.key})`).join(' y ')} · mismo equipo
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-2">
          {model.source === 'fixture' && <Badge tone="warn">Datos locales de prueba</Badge>}
          <span>Datos de Jira: {formatDateTime(new Date(model.generatedAt).toISOString())}</span>
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            <RefreshCw size={14} className={refresh.isPending ? 'animate-spin' : ''} aria-hidden />
            Actualizar
          </button>
        </div>
      </header>

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={{ pathname: n.to, search: n.to === '/configuracion' ? '' : location.search }}
            end
            className={({ isActive }) =>
              `-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                isActive ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink'
              }`
            }
          >
            {n.label}
            {n.to === '/configuracion' && issues > 0 && (
              <span className="ml-1.5 rounded bg-warn px-1 text-[11px] text-warn-ink">{issues}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {refresh.isError && (
        <div className="mb-4">
          <Notice tone="warn">No se pudo actualizar: {(refresh.error as Error).message}</Notice>
        </div>
      )}

      {/* Al recargar se mantiene la vista anterior atenuada, sin saltos. */}
      <main className={`transition-opacity ${fetching || refresh.isPending ? 'opacity-60' : ''}`}>
        <Routes>
          <Route path="/" element={<GlobalView model={model} />} />
          <Route path="/sprints" element={<SprintsView model={model} />} />
          <Route path="/personas" element={<PeopleView model={model} />} />
          <Route path="/configuracion" element={<ConfigView model={model} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  const client = useQueryClient();
  const auth = useQuery({ queryKey: ['auth'], queryFn: api.authStatus, staleTime: Infinity });
  const snapshot = useSnapshot();

  const needsLogin = snapshot.error instanceof UnauthorizedError;
  if (needsLogin) {
    return (
      <Login
        onDone={() => {
          void client.invalidateQueries({ queryKey: SNAPSHOT_KEY });
        }}
      />
    );
  }

  if (snapshot.model) return <Shell model={snapshot.model} fetching={snapshot.isFetching} />;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      {snapshot.error ? (
        <div className="w-full space-y-3">
          <h1 className="text-lg font-semibold">No se pudieron cargar los datos</h1>
          <Notice tone="warn">{(snapshot.error as Error).message}</Notice>
          <button onClick={() => snapshot.refetch()} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm">
            Reintentar
          </button>
          {auth.data?.authRequired === false && (
            <p className="text-xs text-ink-2">El backend está en modo abierto (sin contraseña).</p>
          )}
        </div>
      ) : (
        <p className="w-full text-center text-sm text-ink-2">Consultando Jira…</p>
      )}
    </div>
  );
}
