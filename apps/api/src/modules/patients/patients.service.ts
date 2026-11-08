import { Injectable } from '@nestjs/common';
import { CONSENT_TERM_VERSION, type PatientSignUp } from '@hackathon/contracts';
import { ApiException } from '../../common/api-errors';
import { AuthService, type AuthenticatedPatient } from '../auth/auth.service';

@Injectable()
export class PatientsService {
  constructor(private readonly auth: AuthService) {}

  /**
   * RN-11: a conta só é criada com o consentimento para dados de saúde aceito
   * na versão vigente do termo. Versão e horário do aceite são gravados com a
   * conta, no mesmo INSERT.
   */
  async signUp(input: PatientSignUp): Promise<AuthenticatedPatient> {
    if (
      input.healthDataConsent !== true ||
      input.consentTermVersion !== CONSENT_TERM_VERSION
    ) {
      throw new ApiException('consent_required');
    }
    return this.auth.createAccount({
      name: input.name,
      email: input.email,
      phone: input.phone,
      password: input.password,
      healthConsentVersion: CONSENT_TERM_VERSION,
    });
  }
}
