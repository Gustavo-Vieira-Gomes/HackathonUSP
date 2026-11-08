import { Module } from '@nestjs/common';
import { ClinicsModule } from '../clinics/clinics.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

/** Dono do cadastro de exames da clínica (HACK-17); o guard vem do `ClinicsModule`. */
@Module({
  imports: [ClinicsModule],
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
