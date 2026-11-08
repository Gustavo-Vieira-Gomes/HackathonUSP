import {
  examQuestionnaireSchema,
  type ExamQuestionnaire,
} from '@hackathon/contracts';

const ultrasoundPreparationSource =
  'https://www.uconnhealth.org/imaging-radiology/services-specialties/ultrasound';
const pregnancy = {
  id: 'pregnancy',
  question: 'Você está grávida ou existe possibilidade de gravidez?',
} as const;
const referralMessage =
  'Entre em contato com a clínica para avaliar suas respostas antes de reservar. Isso não significa que o exame seja proibido para você.';

const definitions: Omit<
  ExamQuestionnaire,
  'version' | 'clinicalReview' | 'referralMessage'
>[] = [
  {
    key: 'us-abdomen',
    name: 'Ultrassonografia de abdome',
    scope:
      'Modelo adulto de abdome superior. Abdome total exige protocolo próprio, inclusive avaliação do preparo vesical.',
    preparation: {
      condition:
        'Jejum de alimentos por 8 horas, conforme protocolo a confirmar com a clínica. Água e medicamentos devem ser orientados pela clínica; não suspenda medicamentos por conta própria.',
      hoursBefore: 8,
      confirmation:
        'Confirma que cumpriu o jejum e as instruções específicas fornecidas pela clínica?',
    },
    contraindications: [
      {
        id: 'fasting-needs-assistance',
        question:
          'Você tem diabetes ou outra condição que exige orientação individual para fazer jejum?',
      },
    ],
    sources: [ultrasoundPreparationSource],
  },
  {
    key: 'us-pelvis-transabdominal',
    name: 'Ultrassonografia pélvica transabdominal',
    scope:
      'Somente via transabdominal em adultos; não aplicar à via transvaginal.',
    preparation: {
      condition:
        'Bexiga cheia: iniciar o preparo 1 hora antes, seguindo a quantidade de água e instruções da clínica. Não aumentar líquidos se houver restrição sem orientação.',
      hoursBefore: 1,
      confirmation:
        'Confirma que está com a bexiga cheia conforme a orientação da clínica?',
    },
    contraindications: [
      {
        id: 'fluid-restriction',
        question:
          'Você tem restrição de líquidos ou dificuldade para realizar o preparo com a bexiga cheia?',
      },
    ],
    sources: [
      ultrasoundPreparationSource,
      'https://www.radiologyinfo.org/en/info/pelvus',
    ],
  },
  {
    key: 'us-thyroid',
    name: 'Ultrassonografia de tireoide',
    scope: 'Exame externo, sem biópsia ou sedação.',
    preparation: {
      condition:
        'Sem preparo com antecedência neste modelo; deixar o pescoço acessível e retirar colares para o exame.',
      hoursBefore: 0,
      confirmation:
        'Confirma que leu as orientações e consegue deixar a região do pescoço acessível?',
    },
    contraindications: [],
    sources: ['https://www.radiologyinfo.org/info/us-thyroid'],
  },
  {
    key: 'us-breast',
    name: 'Ultrassonografia de mamas',
    scope: 'Exame externo; procedimentos invasivos não estão incluídos.',
    preparation: {
      condition:
        'Sem preparo com antecedência neste modelo; usar roupa que permita acesso às mamas.',
      hoursBefore: 0,
      confirmation: 'Confirma que leu as orientações para o exame de mamas?',
    },
    contraindications: [],
    sources: ['https://www.radiologyinfo.org/info/breastus'],
  },
  {
    key: 'us-musculoskeletal',
    name: 'Ultrassonografia musculoesquelética',
    scope:
      'Exame externo de articulação ou partes moles; sem procedimento invasivo.',
    preparation: {
      condition:
        'Sem preparo com antecedência neste modelo; deixar a região examinada acessível.',
      hoursBefore: 0,
      confirmation:
        'Confirma que leu as orientações e consegue deixar a região examinada acessível?',
    },
    contraindications: [],
    sources: ['https://www.radiologyinfo.org/en/info/musculous'],
  },
  {
    key: 'echo-transthoracic',
    name: 'Ecocardiograma transtorácico em repouso',
    scope:
      'Somente transtorácico, em repouso, sem contraste, estresse ou sedação; não transesofágico.',
    preparation: {
      condition:
        'Sem jejum neste modelo; alimentação habitual, salvo instrução específica da clínica.',
      hoursBefore: 0,
      confirmation:
        'Confirma que leu as orientações para o ecocardiograma transtorácico em repouso?',
    },
    contraindications: [],
    sources: ['https://www.nhs.uk/tests-and-treatments/echocardiogram/'],
  },
  {
    key: 'mammography',
    name: 'Mamografia',
    scope:
      'Mamografia sem procedimento invasivo; comunicar implantes mamários à equipe para adequar a técnica.',
    preparation: {
      condition:
        'No dia do exame, não usar desodorante, talco ou cremes nas axilas e mamas; levar exames anteriores quando disponíveis.',
      hoursBefore: 0,
      confirmation:
        'Confirma que não está usando desodorante, talco ou cremes nas axilas e mamas?',
    },
    contraindications: [pregnancy],
    sources: ['https://www.radiologyinfo.org/en/info/mammo'],
  },
  {
    key: 'ct-without-contrast',
    name: 'Tomografia sem contraste',
    scope:
      'Modelo adulto de crânio ou tórax, sem contraste por qualquer via e sem sedação; outras regiões exigem revisão específica.',
    preparation: {
      condition:
        'Sem jejum de rotina neste modelo; confirmar instruções da clínica e retirar objetos metálicos da região examinada.',
      hoursBefore: 0,
      confirmation:
        'Confirma que recebeu e cumpriu as instruções da clínica para esta tomografia sem contraste?',
    },
    contraindications: [pregnancy],
    sources: [
      'https://www.radiologyinfo.org/en/info/how-to-prepare-your-ct-exam',
    ],
  },
  {
    key: 'mri-without-contrast',
    name: 'Ressonância magnética sem contraste',
    scope:
      'Modelo adulto de joelho, sem contraste e sem sedação. Outras regiões exigem revisão específica.',
    preparation: {
      condition:
        'Sem jejum neste modelo de joelho sem sedação; retirar objetos metálicos e eletrônicos conforme orientação da equipe. Levar identificação de qualquer implante.',
      hoursBefore: 0,
      confirmation:
        'Confirma que leu as instruções e informará seus implantes e dispositivos à equipe antes de entrar na sala?',
    },
    contraindications: [
      {
        id: 'pacemaker-or-defibrillator',
        question: 'Você usa marca-passo ou desfibrilador implantável?',
      },
      {
        id: 'implant-or-device',
        question:
          'Você tem implantes, clipes cirúrgicos, próteses, implante coclear, neuroestimulador, bomba de medicação ou outro dispositivo médico?',
      },
      {
        id: 'metal-fragment',
        question:
          'Você tem ou pode ter fragmentos metálicos no corpo, principalmente nos olhos?',
      },
      {
        id: 'claustrophobia',
        question:
          'Você tem claustrofobia ou dificuldade para permanecer em local fechado durante o exame?',
      },
      pregnancy,
    ],
    sources: [
      'https://www.radiologyinfo.org/en/info/mr',
      'https://www.fda.gov/radiation-emitting-products/mri-magnetic-resonance-imaging/what-patients-should-know-having-mri-exam',
    ],
  },
];

// Dados candidatos para HACK-15; não persistem nem aprovam protocolos clínicos.
// Identificadores são estáveis, mas NÃO são códigos TUSS.
export const examQuestionnairesSeed: readonly ExamQuestionnaire[] =
  definitions.map((definition) =>
    examQuestionnaireSchema.parse({
      ...definition,
      version: 1,
      clinicalReview: { status: 'pending' },
      referralMessage,
    }),
  );
