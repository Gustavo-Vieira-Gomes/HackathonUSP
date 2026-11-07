import assert from 'node:assert/strict';
import test from 'node:test';
import { healthResponseSchema } from '@hackathon/contracts';
import { createApp, parsePort } from './app';

test('API expõe saúde via HTTP e mantém rotas desconhecidas como 404', async () => {
  const app = await createApp({ logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const response = await fetch(`${url}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(healthResponseSchema.parse(await response.json()), {
      status: 'ok',
      service: 'api',
    });
    assert.equal((await fetch(`${url}/api/missing`)).status, 404);
  } finally {
    await app.close();
  }
});

test('configuração de porta inválida falha antes de iniciar o servidor', () => {
  assert.equal(parsePort(undefined), 3001);
  assert.equal(parsePort('4000'), 4000);
  for (const port of ['', ' ', 'abc', '0', '-1', '65536', '1.5']) {
    assert.throws(() => parsePort(port), /PORT/);
  }
});
