import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closedPortUrl,
  startFakeApi,
} from '../../../shared/services/fake-api.test-helper';
import { searchClinics } from './clinics.service';

// HTTP local exercita transporte real, codificação da query e validação runtime.
test('busca envia filtro codificado e preserva resposta vazia válida', async () => {
  const api = await startFakeApi(() => ({
    status: 200,
    body: '{"clinics":[]}',
  }));
  try {
    assert.deepEqual(
      await searchClinics('CURA & São Paulo', { baseUrl: api.url }),
      { status: 'ok', clinics: [] },
    );
    assert.equal(
      new URL(api.requests[0]!.url, api.url).searchParams.get('q'),
      'CURA & São Paulo',
    );
  } finally {
    await api.close();
  }
});

test('resposta inválida, JSON inválido, erro HTTP e query recusada são explícitos', async () => {
  for (const [status, body, expected] of [
    [200, '{"clinics":[{"name":"sem contrato"}]}', 'error'],
    [200, 'inválido', 'error'],
    [500, '{}', 'error'],
    [400, '{}', 'invalid'],
  ] as const) {
    const api = await startFakeApi(() => ({ status, body }));
    try {
      assert.deepEqual(await searchClinics('', { baseUrl: api.url }), {
        status: expected,
      });
    } finally {
      await api.close();
    }
  }
});

test('timeout e conexão recusada mostram indisponibilidade sem fallback', async () => {
  const api = await startFakeApi(() => null);
  try {
    assert.deepEqual(
      await searchClinics('', { baseUrl: api.url, timeoutMs: 30 }),
      { status: 'error' },
    );
    assert.deepEqual(
      await searchClinics('', { baseUrl: await closedPortUrl() }),
      { status: 'error' },
    );
  } finally {
    await api.close();
  }
});
