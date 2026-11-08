// Utilidades puras do app do paciente (servidor e cliente).
import { findRegion, isPatientSide, type PatientSide } from "@/lib/catalog";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export type ExamSearch = { regionKey: string; side: PatientSide | null };

export const DEFAULT_REGION = "ressonancia.joelho";

export function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Busca do paciente a partir da URL (`regiao`, `lado`), validada pelo catálogo. */
export function readSearch(sp: Record<string, string | string[] | undefined>): ExamSearch {
  const raw = param(sp, "regiao");
  const found = raw ? findRegion(raw) : undefined;
  const regionKey = found ? found.region.key : DEFAULT_REGION;
  const region = found?.region ?? findRegion(DEFAULT_REGION)!.region;
  // Região com lado: direito, esquerdo, ambos ou «conferir». Sem resposta, trata como «conferir».
  const lado = param(sp, "lado");
  const side: PatientSide | null = region.sides ? (isPatientSide(lado) ? lado : "conferir") : null;
  return { regionKey, side };
}

export function searchQuery(s: { regionKey: string; side?: string | null }, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ regiao: s.regionKey });
  if (s.side) q.set("lado", s.side);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

export function examsHref(s: { regionKey: string; side?: string | null }, extra: Record<string, string> = {}): string {
  return `/paciente/exames?${searchQuery(s, extra)}`;
}

/** Busca que leva a uma oferta: bilateral → «ambos»; unilateral → lado pedido (ou «conferir»). */
export function searchSide(scope: string | null, asked?: string | null): PatientSide | null {
  if (scope === "bilateral") return "ambos";
  if (scope === "unilateral") return asked === "esquerdo" || asked === "direito" ? asked : "conferir";
  return null;
}

export function lowerFirst(s: string): string {
  return s ? s[0].toLocaleLowerCase("pt-BR") + s.slice(1) : s;
}

/** "Sem jejum. Tire objetos de metal antes de entrar." → ["Sem jejum", "Tire objetos de metal antes de entrar"]. */
export function splitPrep(prep: string): [string, string | null] {
  const text = prep.trim();
  const i = text.indexOf(". ");
  if (i === -1) return [text.replace(/\.$/, ""), null];
  return [text.slice(0, i), text.slice(i + 2).replace(/\.$/, "")];
}

/** Degraus da escada de preço: cheio, −10%, −20%, −30%, nunca abaixo do piso. */
export function priceSteps(fullCents: number, floorCents: number): number[] {
  return [0, 1, 2, 3].map((i) => Math.max(floorCents, Math.round(fullCents * (1 - 0.1 * i))));
}

export function discountPct(priceCents: number, fullCents: number): number {
  return Math.round((1 - priceCents / fullCents) * 100);
}

/** Contração com o nome do exame: "da ressonância…", "do ultrassom…". */
export function ofExam(regionKey: string, displayName: string): string {
  const masculine = regionKey.startsWith("ultrassom") || regionKey.startsWith("ecocardiograma");
  return `${masculine ? "do" : "da"} ${lowerFirst(displayName)}`;
}

/** Link de uma vaga (e das telas seguintes) levando junto o exame substituto escolhido, quando houver. */
export function vagaHref(v: { id: string; clinic_exam_id: string; is_substitute?: boolean }, suffix = "", lado?: string | null): string {
  const q = new URLSearchParams();
  if (v.is_substitute) q.set("exame", v.clinic_exam_id);
  if (lado === "esquerdo" || lado === "direito" || lado === "ambos") q.set("lado", lado);
  const qs = q.toString();
  return `/paciente/vagas/${v.id}${suffix}${qs ? `?${qs}` : ""}`;
}
