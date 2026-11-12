import { JiraClient, JiraError, mapWithConcurrency } from './jira.client';

type Call = { url: string; body: unknown };

function fakeFetch(responses: Array<{ status?: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const r = responses.shift();
    if (!r) throw new Error('llamada inesperada');
    return new Response(JSON.stringify(r.body ?? {}), {
      status: r.status ?? 200,
      headers: r.headers,
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function client(impl: typeof fetch) {
  return new JiraClient({
    baseUrl: 'https://ejemplo.atlassian.net/',
    email: 'a@b.c',
    apiToken: 't',
    fetchImpl: impl,
    sleep: async () => {},
  });
}

describe('JiraClient', () => {
  it('pagina /search/jql con nextPageToken hasta isLast', async () => {
    const { impl, calls } = fakeFetch([
      { body: { issues: [{ key: 'A-1' }], nextPageToken: 'p2', isLast: false } },
      { body: { issues: [{ key: 'A-2' }], isLast: true } },
    ]);
    const issues = await client(impl).searchAll('project = A', ['summary']);
    expect(issues.map((i) => i.key)).toEqual(['A-1', 'A-2']);
    expect(calls[0].url).toBe('https://ejemplo.atlassian.net/rest/api/3/search/jql');
    expect(calls[1].body).toMatchObject({ nextPageToken: 'p2' });
  });

  it('reintenta 429 y luego responde', async () => {
    const { impl, calls } = fakeFetch([
      { status: 429, headers: { 'retry-after': '1' } },
      { body: { values: [{ id: 1 }], isLast: true } },
    ]);
    const sprints = await client(impl).boardSprints(67);
    expect(sprints).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it('no reintenta errores de autenticación', async () => {
    const { impl } = fakeFetch([{ status: 401, body: { errorMessages: ['no'] } }]);
    await expect(client(impl).projectStatuses('CSE')).rejects.toBeInstanceOf(JiraError);
  });

  it('agrupa el historial masivo por ID de incidencia a través de páginas', async () => {
    const { impl } = fakeFetch([
      {
        body: {
          issueChangeLogs: [{ issueId: '10', changeHistories: [{ created: 1, items: [] }] }],
          nextPageToken: 'n',
        },
      },
      { body: { issueChangeLogs: [{ issueId: '10', changeHistories: [{ created: 2, items: [] }] }] } },
    ]);
    const out = await client(impl).bulkChangelogs(['10'], ['status']);
    expect(out['10']).toHaveLength(2);
  });

  it('pagina el historial por incidencia', async () => {
    const { impl } = fakeFetch([
      { body: { values: [{ created: 'x', items: [] }], total: 2, isLast: false } },
      { body: { values: [{ created: 'y', items: [] }], total: 2, isLast: true } },
    ]);
    expect(await client(impl).issueChangelog('A-1')).toHaveLength(2);
  });
});

describe('mapWithConcurrency', () => {
  it('respeta el límite y conserva el orden', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });
});
