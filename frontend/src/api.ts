import type { Snapshot } from './domain/contract';

/**
 * La API vive en el mismo origen que el dashboard: en producción la sirve el mismo
 * proceso NestJS y en desarrollo Vite redirige /api al backend.
 */
const API = '/api';
const TOKEN_KEY = 'jira-dashboard.session';

export class UnauthorizedError extends Error {}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* almacenamiento no disponible: la sesión dura lo que la pestaña */
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readToken();
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401) throw new UnauthorizedError('Sesión vencida');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  authStatus: () => call<{ authRequired: boolean }>('/auth/status'),
  login: (password: string) =>
    call<{ token: string | null }>('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  snapshot: () => call<Snapshot>('/snapshot'),
  refresh: () => call<Snapshot>('/snapshot/refresh', { method: 'POST' }),
};
