import type {
  RawChangeHistory,
  RawIssue,
  RawProjectStatuses,
  RawSprint,
} from './jira.types';

export class JiraError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    detail: string,
  ) {
    super(`Jira respondió ${status} en ${path}: ${detail}`);
  }
}

export interface JiraClientOptions {
  baseUrl: string;
  email: string;
  apiToken: string;
  /** Inyectable para tests. */
  fetchImpl?: typeof fetch;
  /** Inyectable para tests. */
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

const BULK_CHANGELOG_MAX_ISSUES = 1000;

/**
 * Cliente mínimo de la API REST de Jira Cloud.
 * Reintenta 429 y 5xx respetando Retry-After; el resto de errores se propagan.
 */
export class JiraClient {
  private readonly baseUrl: string;
  private readonly auth: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(opts: JiraClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.auth = 'Basic ' + Buffer.from(`${opts.email}:${opts.apiToken}`).toString('base64');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = opts.maxRetries ?? 4;
  }

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(this.baseUrl + path, {
        method,
        headers: {
          Authorization: this.auth,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60_000),
      });

      if (res.ok) return (await res.json()) as T;

      const retriable = res.status === 429 || res.status >= 500;
      if (retriable && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
        await this.sleep(Math.min(wait, 30_000));
        continue;
      }

      const text = await res.text().catch(() => '');
      throw new JiraError(res.status, path, text.slice(0, 300));
    }
  }

  /** Todas las incidencias de un JQL, paginando con nextPageToken. */
  async searchAll(jql: string, fields: string[]): Promise<RawIssue[]> {
    const out: RawIssue[] = [];
    let nextPageToken: string | undefined;
    do {
      const page = await this.request<{
        issues: RawIssue[];
        nextPageToken?: string;
        isLast?: boolean;
      }>('POST', '/rest/api/3/search/jql', {
        jql,
        fields,
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
      });
      out.push(...(page.issues ?? []));
      nextPageToken = page.isLast === true ? undefined : page.nextPageToken || undefined;
    } while (nextPageToken);
    return out;
  }

  async boardSprints(boardId: number): Promise<RawSprint[]> {
    const out: RawSprint[] = [];
    let startAt = 0;
    for (;;) {
      const page = await this.request<{ values: RawSprint[]; isLast: boolean }>(
        'GET',
        `/rest/agile/1.0/board/${boardId}/sprint?startAt=${startAt}&maxResults=50`,
      );
      out.push(...page.values);
      if (page.isLast || page.values.length === 0) return out;
      startAt += page.values.length;
    }
  }

  projectStatuses(projectKey: string): Promise<RawProjectStatuses[]> {
    return this.request('GET', `/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`);
  }

  /**
   * Historial de varias incidencias con POST /rest/api/3/changelog/bulkfetch
   * (marcado como experimental por Atlassian). Devuelve el historial por ID de incidencia.
   */
  async bulkChangelogs(
    issueIds: string[],
    fieldIds: string[],
  ): Promise<Record<string, RawChangeHistory[]>> {
    const out: Record<string, RawChangeHistory[]> = {};
    for (let i = 0; i < issueIds.length; i += BULK_CHANGELOG_MAX_ISSUES) {
      const chunk = issueIds.slice(i, i + BULK_CHANGELOG_MAX_ISSUES);
      let nextPageToken: string | undefined;
      do {
        const page = await this.request<{
          issueChangeLogs?: { issueId: string; changeHistories: RawChangeHistory[] }[];
          nextPageToken?: string;
        }>('POST', '/rest/api/3/changelog/bulkfetch', {
          issueIdsOrKeys: chunk,
          fieldIds,
          maxResults: 1000,
          ...(nextPageToken ? { nextPageToken } : {}),
        });
        for (const log of page.issueChangeLogs ?? []) {
          (out[log.issueId] ??= []).push(...log.changeHistories);
        }
        nextPageToken = page.nextPageToken || undefined;
      } while (nextPageToken);
    }
    return out;
  }

  /** Historial completo de una incidencia (GET /rest/api/3/issue/{key}/changelog). */
  async issueChangelog(issueKey: string): Promise<RawChangeHistory[]> {
    const out: RawChangeHistory[] = [];
    let startAt = 0;
    for (;;) {
      const page = await this.request<{
        values: RawChangeHistory[];
        isLast?: boolean;
        total?: number;
      }>('GET', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=100`);
      out.push(...page.values);
      startAt += page.values.length;
      const done = page.isLast ?? (page.total !== undefined ? startAt >= page.total : true);
      if (done || page.values.length === 0) return out;
    }
  }
}

/** Ejecuta `fn` sobre cada elemento con un máximo de `limit` tareas simultáneas. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
