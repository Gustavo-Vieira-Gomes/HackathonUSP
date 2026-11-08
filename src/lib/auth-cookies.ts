// Nomes dos cookies do login simulado; usados pelo proxy (edge) e pelo servidor.
export const PATIENT_AUTH_COOKIE = "vc_patient_auth";
export const CLINIC_AUTH_COOKIE = "vc_clinic_auth";

/** Destino seguro depois do login: só caminhos internos da área certa. */
export function safeNext(next: unknown, area: "/paciente" | "/clinica"): string {
  if (typeof next !== "string" || !next.startsWith(area) || next.startsWith("//") || next.includes("/entrar")) return area;
  return next;
}
