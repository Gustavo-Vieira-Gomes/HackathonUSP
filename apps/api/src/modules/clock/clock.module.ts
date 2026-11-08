import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ClockController } from './clock.controller';
import { ClockService } from './clock.service';

/** Global: toda regra de tempo injeta o mesmo `ClockService` (HACK-30). */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [ClockController],
  providers: [ClockService],
  exports: [ClockService],
})
export class ClockModule {}
