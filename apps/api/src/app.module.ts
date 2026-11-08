import { type DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import type { AppEnv } from './config/env';
import { ExamplesModule } from './examples/examples.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({})
export class AppModule {
  static register(env: AppEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        PrismaModule,
        AuthModule,
        ScheduleModule.forRoot(),
        ExamplesModule,
      ],
      controllers: [HealthController],
    };
  }
}
