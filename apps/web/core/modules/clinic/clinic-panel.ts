import 'server-only';
import type { ClinicProfile, SessionUser } from '@hackathon/contracts';
import { getSessionUser } from '@/core/shared/services/session.service';
import {
  type ClinicProfileResult,
  getClinicProfile,
} from './clinic-profile.service';

export type ClinicPanel =
  | { kind: 'redirect'; to: '/clinica/login' }
  | { kind: 'not-clinic' }
  | { kind: 'profile'; profile: ClinicProfile }
  | { kind: 'error' };

interface PanelDeps {
  getSessionUser: (cookie: string) => Promise<SessionUser | null>;
  getClinicProfile: (cookie: string) => Promise<ClinicProfileResult>;
}

/**
 * Decide o que `/clinica` mostra: sem sessão → login; conta de paciente → aviso
 * (sem chamar a API de clínica); clínica → perfil ou indisponibilidade.
 */
export async function loadClinicPanel(
  cookieHeader: string,
  deps: PanelDeps = { getSessionUser, getClinicProfile },
): Promise<ClinicPanel> {
  const user = await deps.getSessionUser(cookieHeader);
  if (!user) return { kind: 'redirect', to: '/clinica/login' };
  if (user.role !== 'clinica') return { kind: 'not-clinic' };
  const result = await deps.getClinicProfile(cookieHeader);
  return result.ok
    ? { kind: 'profile', profile: result.profile }
    : { kind: 'error' };
}
