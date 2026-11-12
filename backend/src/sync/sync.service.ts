import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from '../config/dashboard-config';
import type { DashboardConfig, Snapshot } from '../contract/snapshot';
import { JiraClient, JiraError, mapWithConcurrency } from '../jira/jira.client';
import type { RawChangeHistory, RawDump, RawIssue } from '../jira/jira.types';
import { buildSnapshot, issueFields } from './normalize';

const PER_ISSUE_CONCURRENCY = 6;

/**
 * Descarga los proyectos de Jira, los normaliza y mantiene el último snapshot en
 * memoria. Las peticiones simultáneas comparten la misma descarga.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private cache: { snapshot: Snapshot; at: number } | null = null;
  private inflight: Promise<Snapshot> | null = null;

  private get ttlMs(): number {
    const minutes = Number(process.env.CACHE_TTL_MINUTES ?? 5);
    return (Number.isFinite(minutes) && minutes >= 0 ? minutes : 5) * 60_000;
  }

  async getSnapshot(force = false): Promise<Snapshot> {
    if (!force && this.cache && Date.now() - this.cache.at < this.ttlMs) {
      return this.cache.snapshot;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.build()
      .then((snapshot) => {
        this.cache = { snapshot, at: Date.now() };
        return snapshot;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async build(): Promise<Snapshot> {
    // La configuración se relee en cada descarga para que los cambios no
    // requieran reiniciar el servidor.
    const cfg = loadConfig();
    const fixtureDir = process.env.JIRA_FIXTURE_DIR;
    const started = Date.now();

    const dump = fixtureDir ? readFixture(fixtureDir) : await this.download(cfg);
    if (!fixtureDir && process.env.JIRA_DUMP_DIR) writeDump(process.env.JIRA_DUMP_DIR, dump);

    const snapshot = buildSnapshot(dump, cfg, fixtureDir ? 'fixture' : 'jira', new Date(), process.env.JIRA_BASE_URL ?? null);
    this.logger.log(
      `Snapshot listo: ${snapshot.issues.length} incidencias, ${snapshot.sprints.length} sprints, ` +
        `historial ${snapshot.history.available ? snapshot.history.method : 'no disponible'} ` +
        `(${Date.now() - started} ms)`,
    );
    return snapshot;
  }

  private client(): JiraClient {
    const baseUrl = process.env.JIRA_BASE_URL;
    const email = process.env.JIRA_EMAIL;
    const apiToken = process.env.JIRA_API_TOKEN;
    if (!baseUrl || !email || !apiToken) {
      throw new Error(
        'Faltan JIRA_BASE_URL, JIRA_EMAIL o JIRA_API_TOKEN. Configúralos en backend/.env ' +
          'o define JIRA_FIXTURE_DIR para trabajar sin Jira.',
      );
    }
    return new JiraClient({ baseUrl, email, apiToken });
  }

  private async download(cfg: DashboardConfig): Promise<RawDump> {
    const jira = this.client();
    const fields = issueFields(cfg);
    const issues: RawIssue[] = [];
    const sprints: RawDump['sprints'] = {};
    const statuses: RawDump['statuses'] = {};
    const projectNames: Record<string, string> = {};

    await Promise.all(
      cfg.projects.map(async (p) => {
        const [projectIssues, boardSprints, projectStatuses] = await Promise.all([
          jira.searchAll(`project = "${p.key}" ORDER BY key ASC`, fields),
          jira.boardSprints(p.boardId),
          jira.projectStatuses(p.key),
        ]);
        issues.push(...projectIssues);
        sprints[String(p.boardId)] = boardSprints;
        statuses[p.key] = projectStatuses;
        const name = projectIssues[0]?.fields.project?.name;
        if (name) projectNames[p.key] = name;
      }),
    );

    const history = await this.downloadHistory(jira, cfg, issues);
    return { issues, sprints, statuses, projectNames, ...history };
  }

  /**
   * Historial de estado y sprint de las incidencias que estuvieron en algún sprint.
   * Primero intenta la API masiva; si no existe en el sitio, cae a la API por
   * incidencia; si eso también falla, el dashboard sigue sin historial.
   */
  private async downloadHistory(
    jira: JiraClient,
    cfg: DashboardConfig,
    issues: RawIssue[],
  ): Promise<Pick<RawDump, 'changelogs' | 'historyMethod' | 'historyError'>> {
    const withSprint = issues.filter((i) => {
      const s = i.fields[cfg.fields.sprint];
      return Array.isArray(s) && s.length > 0;
    });
    if (withSprint.length === 0) {
      return { changelogs: {}, historyMethod: 'bulk', historyError: null };
    }
    const keyById = new Map(withSprint.map((i) => [String(i.id), i.key]));

    try {
      const byId = await jira.bulkChangelogs([...keyById.keys()], ['status', cfg.fields.sprint]);
      const changelogs: Record<string, RawChangeHistory[]> = {};
      for (const [id, histories] of Object.entries(byId)) {
        const key = keyById.get(id);
        if (key) changelogs[key] = histories;
      }
      return { changelogs, historyMethod: 'bulk', historyError: null };
    } catch (e) {
      const status = e instanceof JiraError ? e.status : 0;
      this.logger.warn(`API masiva de historial no disponible (${status || (e as Error).message}); se usa la API por incidencia.`);
    }

    try {
      const changelogs: Record<string, RawChangeHistory[]> = {};
      await mapWithConcurrency(withSprint, PER_ISSUE_CONCURRENCY, async (i) => {
        changelogs[i.key] = await jira.issueChangelog(i.key);
      });
      return { changelogs, historyMethod: 'per-issue', historyError: null };
    } catch (e) {
      const message = (e as Error).message;
      this.logger.error(`No se pudo recuperar el historial: ${message}`);
      return { changelogs: null, historyMethod: null, historyError: message };
    }
  }
}

function readJson<T>(file: string, fallback?: T): T {
  if (!existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Falta ${file}`);
  }
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function readFixture(dir: string): RawDump {
  const d = resolve(dir);
  const changelogs = readJson<RawDump['changelogs'] | null>(join(d, 'changelogs.json'), null);
  return {
    issues: readJson(join(d, 'issues.json')),
    sprints: readJson(join(d, 'sprints.json')),
    statuses: readJson(join(d, 'statuses.json'), {}),
    projectNames: readJson(join(d, 'projects.json'), {}),
    changelogs,
    historyMethod: changelogs ? 'fixture' : null,
    historyError: changelogs ? null : 'el fixture no incluye changelogs.json',
  };
}

function writeDump(dir: string, dump: RawDump): void {
  const d = resolve(dir);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'issues.json'), JSON.stringify(dump.issues));
  writeFileSync(join(d, 'sprints.json'), JSON.stringify(dump.sprints));
  writeFileSync(join(d, 'statuses.json'), JSON.stringify(dump.statuses));
  writeFileSync(join(d, 'projects.json'), JSON.stringify(dump.projectNames));
  if (dump.changelogs) writeFileSync(join(d, 'changelogs.json'), JSON.stringify(dump.changelogs));
}
