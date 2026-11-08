import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  ClinicSettings,
  Exam,
  ExamCatalogItem,
  SessionUser,
} from '@hackathon/contracts';
import type { ReadResult } from './clinic-exams.service';
import { loadExamsPage } from './exams-page';

const user = (role: SessionUser['role']): SessionUser => ({
  id: 'u1',
  name: 'Fulana',
  email: 'fulana@teste.local',
  role,
});

const catalog: ExamCatalogItem[] = [
  {
    tussCode: '40901203',
    name: 'Ultrassonografia de tireoide',
    questionnaireKey: 'us-thyroid',
    preparation: { condition: 'Sem preparo.', hoursBefore: 0 },
    contraindicationOptions: [],
  },
];
const settings: ClinicSettings = { depositPercent: 20, dailyDiscountCap: 5 };

function deps(
  session: SessionUser | null,
  results: {
    exams?: ReadResult<Exam[]>;
    catalog?: ReadResult<ExamCatalogItem[]>;
    settings?: ReadResult<ClinicSettings>;
  } = {},
) {
  let reads = 0;
  return {
    reads: () => reads,
    deps: {
      getSessionUser: async () => session,
      getClinicExams: async () => {
        reads++;
        return results.exams ?? { ok: true as const, data: [] };
      },
      getExamCatalog: async () => {
        reads++;
        return results.catalog ?? { ok: true as const, data: catalog };
      },
      getClinicSettings: async () => {
        reads++;
        return results.settings ?? { ok: true as const, data: settings };
      },
    },
  };
}

test('H17-C35 - sem sessão vai ao login, paciente vê aviso sem chamar a API, clínica vê a página ou o erro', async () => {
  assert.deepEqual(await loadExamsPage('', deps(null).deps), {
    kind: 'redirect',
    to: '/clinica/login',
  });

  const patient = deps(user('paciente'));
  assert.deepEqual(await loadExamsPage('c=1', patient.deps), {
    kind: 'not-clinic',
  });
  assert.equal(patient.reads(), 0);

  assert.deepEqual(await loadExamsPage('c=1', deps(user('clinica')).deps), {
    kind: 'page',
    exams: [],
    catalog,
    settings,
  });

  const failures = [
    { exams: { ok: false as const } },
    { catalog: { ok: false as const } },
    { settings: { ok: false as const } },
  ];
  for (const failure of failures) {
    assert.deepEqual(
      await loadExamsPage('c=1', deps(user('clinica'), failure).deps),
      { kind: 'error' },
      JSON.stringify(failure),
    );
  }
  assert.equal(failures.length, 3);
});

test('H52-C4 - sessão expirada durante qualquer leitura de exames leva ao login', async () => {
  for (const status of [401, 403]) {
    for (const resource of ['exams', 'catalog', 'settings'] as const) {
      const expired = deps(user('clinica'), {
        [resource]: { ok: false, status },
      });
      assert.deepEqual(await loadExamsPage('c=1', expired.deps), {
        kind: 'redirect',
        to: '/clinica/login',
      });
    }
  }
});
