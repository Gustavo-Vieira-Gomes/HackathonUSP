import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { authProvider } from './auth.provider';
import { AuthService } from './auth.service';
import { LOGIN_THROTTLE } from './login-throttler.guard';
import { SessionGuard } from './session.guard';
import { SessionsController } from './sessions.controller';

@Module({
  imports: [ThrottlerModule.forRoot([LOGIN_THROTTLE])],
  controllers: [SessionsController],
  providers: [authProvider, AuthService, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
