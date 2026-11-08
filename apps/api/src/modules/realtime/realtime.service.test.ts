import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { realtimeEvents } from '@hackathon/contracts';
import type { Socket } from 'socket.io-client';
import { z } from 'zod';
import {
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';
import { RealtimeService } from './realtime.service';
import {
  NAO_RECEBEU_MS,
  closeAll,
  collect,
  connect,
  generateToken,
  until,
} from './realtime.test-helper';

let t: TestApp;
let service: RealtimeService;
const abertos: Socket[] = [];
before(async () => {
  t = await startTestApp();
  service = t.app.get(RealtimeService);
});
after(async () => {
  closeAll(abertos);
  await t.close();
});

const iso = z.iso.datetime();

async function conta(
  role: 'paciente' | 'clinica',
): Promise<{ id: string; socket: Socket }> {
  const account = await signUpWithCookie(t, role);
  const socket = await connect(t, {
    token: await generateToken(t, account.cookie),
  });
  abertos.push(socket);
  return { id: account.id, socket };
}

async function naVaga(vagaId: string): Promise<Socket> {
  const { socket } = await conta('paciente');
  const ack = await socket
    .timeout(3000)
    .emitWithAck(realtimeEvents.vagaAssinar, { vagaId });
  assert.deepEqual(ack, { ok: true });
  return socket;
}

test('C15 - vagaPreco chega só a quem está em vaga:v1, com 50400 centavos e em ISO', async () => {
  const [a, b, c] = [
    await naVaga('v1'),
    await naVaga('v1'),
    await naVaga('v2'),
  ];
  const [ra, rb, rc] = [a, b, c].map((s) =>
    collect(s, realtimeEvents.vagaPreco),
  );
  service.vagaPreco({ vagaId: 'v1', precoCentavos: 50400 });
  await until(() => ra?.length === 1 && rb?.length === 1);
  for (const recebido of [ra?.[0], rb?.[0]]) {
    const payload = recebido as Record<string, unknown>;
    assert.equal(payload.vagaId, 'v1');
    assert.equal(payload.precoCentavos, 50400);
    assert.ok(iso.safeParse(payload.em).success);
  }
  await sleep(NAO_RECEBEU_MS);
  assert.equal(rc?.length, 0);
});

test('C16 - vagaReservada leva só vagaId e em, e só à sala da vaga', async () => {
  const [a, b, c] = [
    await naVaga('v1'),
    await naVaga('v1'),
    await naVaga('v2'),
  ];
  const [ra, rb, rc] = [a, b, c].map((s) =>
    collect(s, realtimeEvents.vagaReservada),
  );
  service.vagaReservada({ vagaId: 'v1' });
  await until(() => ra?.length === 1 && rb?.length === 1);
  for (const recebido of [ra?.[0], rb?.[0]]) {
    assert.deepEqual(Object.keys(recebido as object).sort(), ['em', 'vagaId']);
    assert.equal((recebido as { vagaId: string }).vagaId, 'v1');
  }
  await sleep(NAO_RECEBEU_MS);
  assert.equal(rc?.length, 0);
});

test('C17 - vagaPublicada chega a p1 e p2 e não a p3', async () => {
  const [p1, p2, p3] = [
    await conta('paciente'),
    await conta('paciente'),
    await conta('paciente'),
  ];
  const [r1, r2, r3] = [p1, p2, p3].map((p) =>
    collect(p.socket, realtimeEvents.vagaPublicada),
  );
  service.vagaPublicada({ vagaId: 'v1' }, [p1.id, p2.id]);
  await until(() => r1?.length === 1 && r2?.length === 1);
  for (const recebido of [r1?.[0], r2?.[0]]) {
    const payload = recebido as Record<string, unknown>;
    assert.equal(payload.vagaId, 'v1');
    assert.ok(iso.safeParse(payload.em).success);
  }
  await sleep(NAO_RECEBEU_MS);
  assert.equal(r3?.length, 0);
});

test('C18 - reservaCriada chega só à clínica c1', async () => {
  const [c1, c2] = [await conta('clinica'), await conta('clinica')];
  const [r1, r2] = [c1, c2].map((c) =>
    collect(c.socket, realtimeEvents.reservaCriada),
  );
  service.reservaCriada(c1.id, { reservaId: 'r1', vagaId: 'v1' });
  await until(() => r1?.length === 1);
  const payload = r1?.[0] as Record<string, unknown>;
  assert.equal(payload.reservaId, 'r1');
  assert.equal(payload.vagaId, 'v1');
  assert.ok(iso.safeParse(payload.em).success);
  await sleep(NAO_RECEBEU_MS);
  assert.equal(r2?.length, 0);
});

test('C19 - payload inválido lança ao emissor e nada é emitido', async () => {
  const vaga = await naVaga('v1');
  const paciente = await conta('paciente');
  const clinica = await conta('clinica');
  const recebidos: unknown[] = [];
  for (const socket of [vaga, paciente.socket, clinica.socket]) {
    socket.onAny((evento: string, payload: unknown) =>
      recebidos.push([evento, payload]),
    );
  }
  const casos: Array<[string, () => void]> = [
    ['preço -1', () => service.vagaPreco({ vagaId: 'v1', precoCentavos: -1 })],
    [
      'preço 1.5',
      () => service.vagaPreco({ vagaId: 'v1', precoCentavos: 1.5 }),
    ],
    [
      "preço '50400'",
      () =>
        service.vagaPreco({
          vagaId: 'v1',
          precoCentavos: '50400' as unknown as number,
        }),
    ],
    [
      'vagaPreco vagaId vazio',
      () => service.vagaPreco({ vagaId: '', precoCentavos: 1 }),
    ],
    ['vagaReservada vagaId vazio', () => service.vagaReservada({ vagaId: '' })],
    [
      'vagaPublicada vagaId vazio',
      () => service.vagaPublicada({ vagaId: '' }, [paciente.id]),
    ],
    [
      'reservaCriada vagaId vazio',
      () => service.reservaCriada(clinica.id, { reservaId: 'r1', vagaId: '' }),
    ],
  ];
  for (const [nome, chamar] of casos) {
    assert.throws(chamar, nome);
  }
  await sleep(NAO_RECEBEU_MS);
  assert.deepEqual(recebidos, []);
});

test('C20 - emitir para sala sem conexões conclui sem erro', async () => {
  await assert.doesNotReject(async () => {
    service.vagaPreco({ vagaId: 'sem-ninguem', precoCentavos: 100 });
    service.vagaPublicada({ vagaId: 'v1' }, ['paciente-sem-conexao']);
    service.reservaCriada('clinica-sem-conexao', {
      reservaId: 'r1',
      vagaId: 'v1',
    });
  });
});
