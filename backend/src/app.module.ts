import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { HealthController } from './health.controller';
import { PlacesController } from './places/places.controller';
import { PlacesService } from './places/places.service';
import { PrismaService } from './prisma.service';
import { ScansController } from './scans/scans.controller';
import { ScansService } from './scans/scans.service';
import { StatsController } from './stats/stats.controller';
import { TypesController } from './types/types.controller';
import { TypesService } from './types/types.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]), // 300 req/min por IP
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET, // checada no boot (main.ts)
      signOptions: { algorithm: 'HS256', expiresIn: '30d' },
      verifyOptions: { algorithms: ['HS256'] },
    }),
  ],
  controllers: [AuthController, HealthController, PlacesController, TypesController, ScansController, StatsController],
  providers: [AuthService, PrismaService, PlacesService, TypesService, ScansService, { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
