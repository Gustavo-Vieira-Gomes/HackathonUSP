import "server-only";
import { cookies } from "next/headers";
import { DEMO_PATIENT_ID } from "./data";
import { CLINIC_AUTH_COOKIE, PATIENT_AUTH_COOKIE } from "./auth-cookies";

const PATIENT_COOKIE = "vc_patient";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = 60 * 60 * 24 * 30;

/** Paciente do protótipo: o cadastrado neste navegador ou, se não houver, a Marina da demo. */
export async function currentPatientId(): Promise<string> {
  const value = (await cookies()).get(PATIENT_COOKIE)?.value;
  return value && UUID.test(value) ? value : DEMO_PATIENT_ID;
}

export async function setCurrentPatient(id: string) {
  (await cookies()).set(PATIENT_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: MONTH });
}

export async function clearCurrentPatient() {
  (await cookies()).delete(PATIENT_COOKIE);
}

// Login simulado: um cookie só diz "entrou". Não há senha conferida nem sessão real.
export async function startPatientSession() {
  (await cookies()).set(PATIENT_AUTH_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: MONTH });
}

export async function endPatientSession() {
  (await cookies()).delete(PATIENT_AUTH_COOKIE);
}

export async function startClinicSession() {
  (await cookies()).set(CLINIC_AUTH_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: MONTH });
}

export async function endClinicSession() {
  (await cookies()).delete(CLINIC_AUTH_COOKIE);
}
