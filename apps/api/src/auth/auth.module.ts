import { Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { APP_ENV, type AppEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { createAuth } from './auth.config';
import { AuthSessionService } from './auth-session.service';
import { MeController } from './me.controller';
import { SignUpController } from './sign-up.controller';
import { SignUpService } from './sign-up.service';

/**
 * Better Auth montado no Nest. O módulo da biblioteca registra o guard global:
 * toda rota nasce protegida e rota pública precisa de `@AllowAnonymous()`.
 */
@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      inject: [APP_ENV, PrismaService],
      useFactory: (env: AppEnv, prisma: PrismaService) => ({
        auth: createAuth(env, prisma),
      }),
    }),
  ],
  controllers: [SignUpController, MeController],
  providers: [AuthSessionService, SignUpService],
  exports: [AuthSessionService],
})
export class AuthModule {}
