import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closedPortUrl,
  startFakeApi,
} from '@/core/shared/services/fake-api.test-helper';
import {
  CLINIC_EXAMS_TIMEOUT_MS,
  getClinicExams,
  getClinicSettings,
  getExamCatalog,
} from './clinic-exams.service';

const exam = {
  id: '6f1c6c1e-2f7a-4a4e-9a51-0d0a7c2b1e01',
  tussCode: '41101316',
  name: 'Ressonância magnética articular sem contraste',
  fullPriceCents: 72000,
  floorPriceCents: 50000,
  minLeadMinutes: 360,
  preparationCondition: 'nenhum',
  preparationHours: 0,
  contraindications: ['pacemaker-or-defibrillator'],
  toleranceMinutes: 15,
  maxTravelMinutes: 45,
  priceSteps: [{ leadMinutes: 2880, discountPercent: 10 }],
};
const item = {
  tussCode: '41101316',
  name: 'Ressonância magnética articular sem contraste',
  questionnaireKey: 'mri-without-contrast',
  preparation: { condition: 'Retirar metais.', hoursBefore: 0 },
  contraindicationOptions: [
    { id: 'claustrophobia', question: 'Tem claustrofobia?' },
  ],
};

const readers = [
  {
    name: 'getClinicExams',
    read: getClinicExams,
    path: '/api/clinic/exams',
    valid: { exams: [exam] },
    invalid: { exams: [{ ...exam, id: 'nao-uuid' }] },
    data: [exam],
  },
  {
    name: 'getExamCatalog',
    read: getExamCatalog,
    path: '/api/clinic/exam-catalog',
    valid: { items: [item] },
    invalid: { items: [{ ...item, questionnaireKey: 'raio-x' }] },
    data: [item],
  },
  {
    name: 'getClinicSettings',
    read: getClinicSettings,
    path: '/api/clinic/settings',
    valid: { depositPercent: 20, dailyDiscountCap: 5 },
    invalid: { depositPercent: 0, dailyDiscountCap: 5 },
    data: { depositPercent: 20, dailyDiscountCap: 5 },
  },
] as const;

const jsonReply = (status: number, body: unknown) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('H17-C36 - cada leitura vira indisponível com 500, timeout, corpo fora do contrato e rede, e devolve o dado válido', async () => {
  assert.equal(CLINIC_EXAMS_TIMEOUT_MS, 5000);
  for (const reader of readers) {
    const failing = [
      await startFakeApi(() => jsonReply(500, {})),
      await startFakeApi(() => null),
      await startFakeApi(() => jsonReply(200, reader.invalid)),
    ];
    try {
      for (const api of failing) {
        const result = await reader.read('c=1', {
          baseUrl: api.url,
          timeoutMs: 200,
        });
        assert.deepEqual(result, { ok: false }, reader.name);
      }
      assert.deepEqual(
        await reader.read('c=1', { baseUrl: await closedPortUrl() }),
        { ok: false },
        reader.name,
      );
    } finally {
      await Promise.all(failing.map((api) => api.close()));
    }

    const ok = await startFakeApi(() => jsonReply(200, reader.valid));
    try {
      const result = await reader.read('c=1', { baseUrl: ok.url });
      assert.deepEqual(result, { ok: true, data: reader.data }, reader.name);
      assert.equal(ok.requests[0]?.url, reader.path);
      assert.equal(ok.requests[0]?.headers.cookie, 'c=1');
    } finally {
      await ok.close();
    }
  }
  assert.equal(readers.length, 3);
});

test('H52-C4 - leituras preservam 401 e 403 para a navegação de login', async () => {
  for (const status of [401, 403]) {
    const api = await startFakeApi(() => jsonReply(status, {}));
    try {
      for (const reader of readers) {
        assert.deepEqual(await reader.read('c=1', { baseUrl: api.url }), {
          ok: false,
          status,
        });
      }
    } finally {
      await api.close();
    }
  }
});
