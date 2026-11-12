import {
  Controller,
  Get,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ConfigError } from '../config/dashboard-config';
import type { Snapshot } from '../contract/snapshot';
import { JiraError } from '../jira/jira.client';
import { SyncService } from '../sync/sync.service';

@Controller('snapshot')
@UseGuards(AuthGuard)
export class SnapshotController {
  private readonly logger = new Logger(SnapshotController.name);

  constructor(private readonly sync: SyncService) {}

  @Get()
  get(): Promise<Snapshot> {
    return this.run(false);
  }

  /** Fuerza una descarga nueva desde Jira (botón "Actualizar"). */
  @Post('refresh')
  @HttpCode(200)
  refresh(): Promise<Snapshot> {
    return this.run(true);
  }

  private async run(force: boolean): Promise<Snapshot> {
    try {
      return await this.sync.getSnapshot(force);
    } catch (e) {
      this.logger.error((e as Error).message);
      if (e instanceof ConfigError) throw new InternalServerErrorException(e.message);
      if (e instanceof JiraError) {
        const hint =
          e.status === 401 || e.status === 403
            ? 'Revisa JIRA_EMAIL y JIRA_API_TOKEN, y que la cuenta tenga acceso a ambos proyectos.'
            : 'Reintenta en unos minutos.';
        throw new InternalServerErrorException(`No se pudo leer Jira (HTTP ${e.status}). ${hint}`);
      }
      throw new InternalServerErrorException((e as Error).message);
    }
  }
}
