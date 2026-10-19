import 'dotenv/config';
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida. Copie .env.example para .env (ver INFRA.md).');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não definida (obrigatória). Ver .env.example e INFRA.md.');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.set('trust proxy', 1); // atrás do proxy da Railway: rate limit por IP real
  app.useBodyParser('json', { limit: '10mb' }); // mapas com planta em base64 são grandes
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  new Logger('Main').log(`In-Route API em :${port}`);
}
bootstrap().catch((e) => { console.error('Falha ao iniciar:', e); process.exit(1); });
