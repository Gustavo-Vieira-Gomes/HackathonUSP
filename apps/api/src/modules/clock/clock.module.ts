import { Global, Module } from '@nestjs/common';
import { ClockController } from './clock.controller';
import { ClockService } from './clock.service';

/** Global: toda regra de tempo injeta o mesmo `ClockService` (HACK-30). */
@Global()
@Module({
  controllers: [ClockController],
  providers: [ClockService],
  exports: [ClockService],
})
export class ClockModule {}
