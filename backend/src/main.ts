import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AppModule } from './app.module';
import { loadConfig } from './config/dashboard-config';

/** Carpeta del frontend compilado (frontend/dist), servida por este mismo proceso. */
function frontendDir(): string | null {
  const dir = resolve(process.env.FRONTEND_DIST || join(__dirname, '../../frontend/dist'));
  return existsSync(join(dir, 'index.html')) ? dir : null;
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Carga backend/.env si existe (en producción las variables vienen del entorno).
  try {
    process.loadEnvFile(join(__dirname, '../.env'));
  } catch {
    /* sin .env */
  }

  // Falla al arrancar si la configuración es inválida, no en la primera petición.
  loadConfig();
  if (process.env.DASHBOARD_PASSWORD && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET es obligatorio cuando DASHBOARD_PASSWORD está definido.');
  }
  if (!process.env.DASHBOARD_PASSWORD) {
    logger.warn('DASHBOARD_PASSWORD no está definido: el dashboard queda abierto (solo para desarrollo).');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');

  // Un solo servicio: la API en /api y el dashboard en el resto de rutas.
  const web = frontendDir();
  if (web) {
    app.useStaticAssets(web, { index: false, maxAge: '1h' });
    // Rutas del dashboard (/sprints, /personas…): siempre index.html; React decide qué mostrar.
    app.use((req: Request, res: Response, next: NextFunction) => {
      // Archivos inexistentes (/assets/x.js) siguen a 404 en vez de recibir el HTML.
      if (req.method !== 'GET' || req.path.startsWith('/api') || /\.[a-z0-9]+$/i.test(req.path)) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(web, 'index.html'));
    });
  } else {
    logger.warn('No se encontró frontend/dist: solo se sirve la API. Ejecuta "npm run build" en la raíz.');
  }

  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port);
  logger.log(
    `Dashboard en http://localhost:${port}${web ? '' : ' (solo API)'} · ` +
      (process.env.JIRA_FIXTURE_DIR ? `fixture: ${process.env.JIRA_FIXTURE_DIR}` : 'Jira en vivo'),
  );
}

void bootstrap();
