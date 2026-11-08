// Catálogo único de exames, conforme «Catalogo_de_exames.pdf» (08/11/2026).
// O paciente busca por ele e a clínica cadastra por ele, para a clínica nunca oferecer
// um exame que o paciente não consiga achar. Não acrescente regiões só porque outros serviços têm.
//
// Lado (paciente) × abrangência (oferta da clínica):
// - O paciente responde conforme o pedido médico: direito, esquerdo, ambos ou «não sei / conferir pedido».
// - A clínica oferta um lado só («unilateral», o paciente diz qual) ou os dois («bilateral»).
// - «Ambos» é o exame bilateral, com preço e duração próprios. Não é uma vaga unilateral que aceita qualquer lado.

/** Lado pedido pelo paciente. «conferir» = não sabe; a clínica confere no pedido. */
export type PatientSide = "esquerdo" | "direito" | "ambos" | "conferir";
/** Abrangência da oferta da clínica (coluna clinic_exams.side). */
export type Scope = "unilateral" | "bilateral";
/** @deprecated use PatientSide ou Scope */
export type Side = PatientSide | Scope;

export type Region = {
  key: string; // ex.: "ressonancia.joelho"
  label: string; // ex.: "Joelho"
  /** Nome do exame sem lado, ex.: "Ressonância de joelho" */
  name: string;
  /** Região com lado: pergunta ao paciente e abrangência na oferta. `mama` usa a pergunta da mamografia. */
  sides?: { question: string; kind: "lado" | "mama" };
  /** A clínica confere a extensão exata com o pedido antes da reserva definitiva (abdômen e pélvico). */
  checkExtent?: boolean;
};

export type ExamType = {
  key: string;
  /** Rótulo curto (migalhas, listas): "Ressonância" */
  label: string;
  /** Rótulo completo do catálogo: "Ressonância magnética" */
  fullLabel: string;
  /** Detalhe do catálogo: "sem contraste", "transtorácico adulto" */
  note?: string;
  room: string;
  /** Pergunta da região; ausente quando o tipo é a própria região (mamografia, ecocardiograma) */
  question?: string;
  regions: Region[];
  warnings: string[];
};

const lado = { question: "Qual lado o pedido indica?", kind: "lado" as const };

export const CATALOG: ExamType[] = [
  {
    key: "ressonancia",
    label: "Ressonância",
    fullLabel: "Ressonância magnética",
    note: "sem contraste",
    room: "Ressonância",
    question: "Qual região?",
    warnings: ["Marca-passo ou desfibrilador", "Gravidez", "Clipe de aneurisma", "Implante coclear", "Metal no corpo", "Medo de lugar fechado"],
    regions: [
      { key: "ressonancia.joelho", label: "Joelho", name: "Ressonância de joelho", sides: lado },
      { key: "ressonancia.ombro", label: "Ombro", name: "Ressonância de ombro", sides: lado },
      { key: "ressonancia.coluna-lombar", label: "Coluna lombar", name: "Ressonância da coluna lombar" },
      { key: "ressonancia.cranio", label: "Crânio", name: "Ressonância do crânio" },
    ],
  },
  {
    key: "tomografia",
    label: "Tomografia",
    fullLabel: "Tomografia",
    note: "sem contraste",
    room: "Tomografia",
    question: "Qual região?",
    warnings: ["Gravidez", "Alergia a contraste"],
    regions: [
      { key: "tomografia.cranio", label: "Crânio", name: "Tomografia do crânio" },
      { key: "tomografia.torax", label: "Tórax", name: "Tomografia do tórax" },
      { key: "tomografia.abdomen", label: "Abdômen", name: "Tomografia do abdômen" },
      { key: "tomografia.seios-da-face", label: "Seios da face", name: "Tomografia dos seios da face" },
    ],
  },
  {
    key: "ultrassom",
    label: "Ultrassom",
    fullLabel: "Ultrassom",
    room: "Ultrassom",
    question: "Qual região?",
    warnings: [],
    regions: [
      { key: "ultrassom.abdomen", label: "Abdômen", name: "Ultrassom do abdômen", checkExtent: true },
      { key: "ultrassom.pelvico", label: "Pélvico", name: "Ultrassom pélvico", checkExtent: true },
      { key: "ultrassom.tireoide", label: "Tireoide", name: "Ultrassom da tireoide" },
      { key: "ultrassom.ombro", label: "Ombro", name: "Ultrassom de ombro", sides: lado },
    ],
  },
  {
    key: "mamografia",
    label: "Mamografia",
    fullLabel: "Mamografia",
    room: "Mamografia",
    warnings: ["Gravidez ou amamentação", "Prótese de silicone"],
    regions: [{ key: "mamografia", label: "Mamografia", name: "Mamografia", sides: { question: "O que o pedido indica?", kind: "mama" } }],
  },
  {
    key: "ecocardiograma",
    label: "Ecocardiograma",
    fullLabel: "Ecocardiograma",
    note: "transtorácico adulto",
    room: "Ultrassom",
    warnings: [],
    regions: [{ key: "ecocardiograma", label: "Ecocardiograma", name: "Ecocardiograma transtorácico adulto" }],
  },
];

export function findType(typeKey: string) {
  return CATALOG.find((t) => t.key === typeKey);
}

export function findRegion(regionKey: string): { type: ExamType; region: Region } | undefined {
  for (const type of CATALOG) {
    const region = type.regions.find((r) => r.key === regionKey);
    if (region) return { type, region };
  }
  return undefined;
}

const PATIENT_SIDES: PatientSide[] = ["esquerdo", "direito", "ambos", "conferir"];

export function isPatientSide(v: unknown): v is PatientSide {
  return typeof v === "string" && (PATIENT_SIDES as string[]).includes(v);
}

/** Opções de lado do paciente, na ordem do catálogo. Mamografia: a bilateral vem primeiro (oferta padrão). */
export function patientSideOptions(region: Region): { side: PatientSide; label: string; hint?: string }[] {
  if (!region.sides) return [];
  if (region.sides.kind === "mama") {
    return [
      { side: "esquerdo", label: "Esquerda", hint: "Mamografia unilateral" },
      { side: "direito", label: "Direita", hint: "Mamografia unilateral" },
      { side: "conferir", label: "Não sei / conferir pedido" },
    ];
  }
  return [
    { side: "direito", label: "Direito" },
    { side: "esquerdo", label: "Esquerdo" },
    { side: "ambos", label: "Ambos", hint: "Os dois lados no mesmo exame" },
    { side: "conferir", label: "Não sei / conferir pedido" },
  ];
}

/** Nome do exame como o paciente pediu, ex.: "Ressonância de joelho esquerdo", "Mamografia bilateral". */
export function examName(regionKey: string, side?: string | null): string {
  const found = findRegion(regionKey);
  if (!found) return regionKey;
  const { region } = found;
  if (!region.sides || !side || side === "conferir") return region.name;
  if (region.sides.kind === "mama") {
    if (side === "ambos" || side === "bilateral") return "Mamografia bilateral";
    if (side === "esquerdo") return "Mamografia unilateral esquerda";
    if (side === "direito") return "Mamografia unilateral direita";
    return "Mamografia unilateral";
  }
  if (side === "ambos" || side === "bilateral") return `${region.name} bilateral`;
  if (side === "esquerdo" || side === "direito") return `${region.name} ${side}`;
  return region.name;
}

/** Resumo de lado e abrangência para busca, pagamento e confirmação. Null quando a região não tem lado. */
export function sideSummary(regionKey: string, side: string | null | undefined): string | null {
  const found = findRegion(regionKey);
  if (!found?.region.sides) return null;
  const mama = found.region.sides.kind === "mama";
  if (side === "esquerdo") return mama ? "Mama esquerda · unilateral" : "Lado esquerdo · unilateral";
  if (side === "direito") return mama ? "Mama direita · unilateral" : "Lado direito · unilateral";
  if (side === "ambos" || side === "bilateral") return mama ? "As duas mamas · bilateral" : "Os dois lados · bilateral";
  return "Lado a conferir no pedido médico";
}

/** A oferta da clínica atende a busca do paciente? */
export function offerMatches(offer: { region_key: string; side: string | null }, search: { regionKey: string; side?: string | null }): boolean {
  if (offer.region_key !== search.regionKey) return false;
  if (!offer.side || !search.side || search.side === "conferir") return true;
  if (search.side === "ambos") return offer.side === "bilateral";
  return offer.side === "unilateral";
}

/** Lado que vai para a reserva: bilateral grava «ambos»; unilateral grava o lado pedido (ou nada, a conferir). */
export function sideForOffer(scope: string | null, side: string | null | undefined): "esquerdo" | "direito" | "ambos" | null {
  if (scope === "bilateral") return "ambos";
  if (scope === "unilateral" && (side === "esquerdo" || side === "direito")) return side;
  return null;
}

/** Abrangências que a clínica pode ofertar numa região com lado. */
export function clinicScopeOptions(region: Region): { scope: Scope; label: string; hint: string }[] {
  if (!region.sides) return [];
  if (region.sides.kind === "mama") {
    return [
      { scope: "bilateral", label: "Bilateral (as duas mamas)", hint: "Oferta padrão" },
      { scope: "unilateral", label: "Unilateral (uma mama)", hint: "O paciente informa qual" },
    ];
  }
  return [
    { scope: "unilateral", label: "Um lado (direito ou esquerdo)", hint: "O paciente informa qual" },
    { scope: "bilateral", label: "Os dois lados (bilateral)", hint: "Preço e duração próprios" },
  ];
}

/** Rótulo da abrangência ofertada, ex.: "Um lado (direito ou esquerdo)". */
export function clinicScopeLabel(regionKey: string, scope: string | null): string | null {
  const found = findRegion(regionKey);
  if (!found || !scope) return null;
  return clinicScopeOptions(found.region).find((o) => o.scope === scope)?.label ?? null;
}

/** @deprecated use clinicScopeLabel */
export const clinicSideLabel = clinicScopeLabel;

/** Nome sugerido para a oferta da clínica: "Ressonância de joelho" (um lado) ou "… bilateral". */
export function clinicDefaultName(regionKey: string, scope: string | null): string {
  const found = findRegion(regionKey);
  if (!found) return regionKey;
  const { region } = found;
  if (!region.sides || !scope) return region.name;
  if (region.sides.kind === "mama") return scope === "bilateral" ? "Mamografia bilateral" : "Mamografia unilateral";
  return scope === "bilateral" ? `${region.name} bilateral` : region.name;
}
