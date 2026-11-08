import { ClockModule } from '../modules/clock/clock.module';
import { PatientSignUpService } from '../modules/patients/patient-sign-up.service';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { APP_ENV, type AppEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { createAuth } from './auth.config';
import { AuthSessionService } from './auth-session.service';
import { MeController } from './me.controller';
import { SIGN_UP_RATE_LIMIT, SignUpRequestGuard } from './sign-up-protection';
import { SignUpController } from './sign-up.controller';
import { SignUpService } from './sign-up.service';

/**
 * Better Auth montado no Nest. O módulo da biblioteca registra o guard global:
 * toda rota nasce protegida e rota pública precisa de `@AllowAnonymous()`.
 */
@Module({
  imports: [
    ClockModule,
    BetterAuthModule.forRootAsync({
      inject: [APP_ENV, PrismaService],
      useFactory: (env: AppEnv, prisma: PrismaService) => ({
        auth: createAuth(env, prisma),
      }),
    }),
    // Armazenamento em memória (uma instância); só vale onde o ThrottlerGuard é aplicado.
    ThrottlerModule.forRoot([SIGN_UP_RATE_LIMIT]),
  ],
  controllers: [SignUpController, MeController],
  providers: [
    AuthSessionService,
    SignUpService,
    SignUpRequestGuard,
    PatientSignUpService,
  ],
  exports: [AuthSessionService, SignUpService],
})
export class AuthModule {}
