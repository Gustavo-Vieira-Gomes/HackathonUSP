import 'server-only';
import type { ClinicProfile } from '@hackathon/contracts';
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
  getClinicProfile: (cookie: string) => Promise<ClinicProfileResult>;
}

/**
 * Uma consulta distingue sessão expirada, acesso negado e indisponibilidade.
 */
export async function loadClinicPanel(
  cookieHeader: string,
  deps: PanelDeps = { getClinicProfile },
): Promise<ClinicPanel> {
  const result = await deps.getClinicProfile(cookieHeader);
  if (!result.ok && result.status === 401)
    return { kind: 'redirect', to: '/clinica/login' };
  if (!result.ok && result.status === 403) return { kind: 'not-clinic' };
  return result.ok
    ? { kind: 'profile', profile: result.profile }
    : { kind: 'error' };
}
