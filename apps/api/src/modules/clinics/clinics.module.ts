import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ClinicGuard } from './clinic.guard';
import { ClinicSignUpController } from './clinic-sign-up.controller';
import { ClinicSignUpService } from './clinic-sign-up.service';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';
import { GeocodingService } from './geocoding.service';

/**
 * Dono da clínica (HACK-16): cadastro com perfil e o guard da clínica da sessão.
 * Rotas de clínica de outros módulos (HACK-17 a 20) importam este módulo e usam
 * `@ClinicOnly()` + `@CurrentClinicId()` de `./clinic.guard`.
 */
@Module({
  imports: [AuthModule],
  controllers: [ClinicsController, ClinicSignUpController],
  providers: [
    ClinicSignUpService,
    ClinicGuard,
    GeocodingService,
    ClinicsService,
  ],
  exports: [ClinicGuard, GeocodingService],
})
export class ClinicsModule {}
