import { Controller, Get, Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { SnapshotController } from './snapshot/snapshot.controller';
import { SyncService } from './sync/sync.service';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}

@Module({
  controllers: [HealthController, AuthController, SnapshotController],
  providers: [SyncService],
})
export class AppModule {}
