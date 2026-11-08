import { type DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import type { AppEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { ClinicsModule } from './modules/clinics/clinics.module';
import { ClockModule } from './modules/clock/clock.module';
import { ExamsModule } from './modules/exams/exams.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PhoneVerificationModule } from './modules/phone-verification/phone-verification.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { VacanciesModule } from './modules/vacancies/vacancies.module';
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
        ClockModule,
        RealtimeModule,
        VacanciesModule,
        NotificationsModule,
        ClinicsModule,
        ExamsModule,
        PhoneVerificationModule,
      ],
      controllers: [HealthController],
    };
  }
}
