import 'reflect-metadata';
import type { ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { STATIC_URL_PREFIX, UPLOADS_URL_PREFIX } from './uploads/uploads';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

  // Rate limiting keys on the client IP. Behind a proxy Express reports the
  // proxy's address unless it is told how many hops to trust, which would put
  // every user in one bucket and let a single caller lock out the world.
  const trustProxyHops = config.get<number>('TRUST_PROXY_HOPS') ?? 0;
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  // All routes live under /v1 to match the public base https://api.amragrir.am/v1.
  app.setGlobalPrefix('v1');

  // Images. Outside `/v1` on purpose: these are files, not an API version —
  // a menu photo uploaded today keeps its address when the API is versioned
  // again, and an `<img src>` never negotiates a version anyway.
  //
  // `nosniff` on both, because one of the two directories holds bytes that came
  // from outside: the extension decides the Content-Type a file is served with,
  // `UploadsService` decides the extension from the bytes themselves, and this
  // stops a browser from overruling either.
  const images = (cacheControl: string) => ({
    index: false,
    setHeaders: (res: ServerResponse): void => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', cacheControl);
    },
  });

  // Uploads are immutable by construction — every stored name is a fresh uuid,
  // so a file never changes under its URL and a year is safe to promise.
  app.useStaticAssets(resolve(config.get<string>('UPLOAD_DIR') ?? './uploads'), {
    ...images('public, max-age=31536000, immutable'),
    prefix: `${UPLOADS_URL_PREFIX}/`,
  });
  // The artwork that ships with the repo — the placeholders every seeded dish
  // points at — kept apart from `UPLOAD_DIR` so that emptying uploads cannot
  // take the fallbacks with it. An hour rather than a year: these keep their
  // names across deploys, so a corrected placeholder has to be able to arrive.
  app.useStaticAssets(resolve(__dirname, '..', 'public'), {
    ...images('public, max-age=3600'),
    prefix: `${STATIC_URL_PREFIX}/`,
  });

  // Plain `ws`, not socket.io: React Native and every browser ship a WebSocket
  // client already, so the app needs no extra dependency and no protocol shim.
  app.useWebSocketAdapter(new WsAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const corsOrigin = config.get<string>('CORS_ORIGIN');
  app.enableCors({ origin: corsOrigin ? corsOrigin.split(',') : true, credentials: true });

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/v1`, 'Bootstrap');
}

void bootstrap().catch((error: unknown) => {
  // A port that is already taken is a local accident, not a defect, and a stack
  // trace through `node:net` says nothing a developer can act on. `dev` clears
  // an orphaned copy of this API away before Nest starts
  // (`scripts/free-port.mjs`), so what reaches here is a port held by something
  // this repository has no claim on — say which port, and stop.
  if ((error as NodeJS.ErrnoException | null)?.code === 'EADDRINUSE') {
    const port = process.env.PORT ?? 3000;
    Logger.error(
      `Port ${port} is already in use — something else is listening on it. Stop it, or set PORT to a free one.`,
      'Bootstrap',
    );
    process.exit(1);
  }
  throw error;
});
