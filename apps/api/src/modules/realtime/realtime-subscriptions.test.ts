import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { realtimeEvents } from '@hackathon/contracts';
import type { Socket } from 'socket.io-client';
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
  serverRooms,
  until,
} from './realtime.test-helper';

let t: TestApp;
const abertos: Socket[] = [];
before(async () => {
  t = await startTestApp();
});
after(async () => {
  closeAll(abertos);
  await t.close();
});

/** Paciente conectado só por token, sem header `cookie` (como em produção). */
async function pacientePorToken(): Promise<Socket> {
  const conta = await signUpWithCookie(t, 'paciente');
  const socket = await connect(t, {
    token: await generateToken(t, conta.cookie),
  });
  abertos.push(socket);
  return socket;
}

function assinar(socket: Socket, payload: unknown): Promise<unknown> {
  return socket.timeout(3000).emitWithAck(realtimeEvents.vagaAssinar, payload);
}

function sair(socket: Socket, payload: unknown): Promise<unknown> {
  return socket.timeout(3000).emitWithAck(realtimeEvents.vagaSair, payload);
}

test('C11 - vaga.assinar numa conexão só por token responde ok e entra em vaga:v1', async () => {
  const socket = await pacientePorToken();
  assert.deepEqual(await assinar(socket, { vagaId: 'v1' }), { ok: true });
  assert.ok(serverRooms(t, socket).has('vaga:v1'));
});

test('C12 - vagaId inválido responde payload_invalido e não muda as salas; 64 caracteres é aceito', async () => {
  const socket = await pacientePorToken();
  assert.deepEqual(await assinar(socket, { vagaId: 'base' }), { ok: true });
  const invalidos: Array<[string, unknown]> = [
    ['vazio', { vagaId: '' }],
    ['número', { vagaId: 123 }],
    ['ausente', {}],
    ['null', { vagaId: null }],
    ['65 caracteres', { vagaId: 'x'.repeat(65) }],
  ];
  for (const [evento, enviar] of [
    ['vaga.assinar', assinar],
    ['vaga.sair', sair],
  ] as const) {
    for (const [nome, payload] of invalidos) {
      const antes = serverRooms(t, socket);
      assert.deepEqual(
        await enviar(socket, payload),
        { ok: false, erro: 'payload_invalido' },
        `${evento} ${nome}`,
      );
      assert.deepEqual(serverRooms(t, socket), antes, `${evento} ${nome}`);
    }
  }
  const limite = 'y'.repeat(64);
  assert.deepEqual(await assinar(socket, { vagaId: limite }), { ok: true });
  assert.ok(serverRooms(t, socket).has(`vaga:${limite}`));
});

test('C13 - a 21ª vaga responde limite_assinaturas e não entra na sala', async () => {
  const socket = await pacientePorToken();
  for (let i = 1; i <= 20; i++) {
    assert.deepEqual(
      await assinar(socket, { vagaId: `v${i}` }),
      { ok: true },
      `v${i}`,
    );
  }
  assert.deepEqual(await assinar(socket, { vagaId: 'v21' }), {
    ok: false,
    erro: 'limite_assinaturas',
  });
  assert.ok(!serverRooms(t, socket).has('vaga:v21'));
});

test('C14 - vaga.sair tira da sala e o cliente deixa de receber a vaga', async () => {
  const saiu = await pacientePorToken();
  const ficou = await pacientePorToken();
  assert.deepEqual(await assinar(saiu, { vagaId: 'v1' }), { ok: true });
  assert.deepEqual(await assinar(ficou, { vagaId: 'v1' }), { ok: true });
  assert.deepEqual(await sair(saiu, { vagaId: 'v1' }), { ok: true });
  assert.ok(!serverRooms(t, saiu).has('vaga:v1'));

  const recebidosSaiu = collect(saiu, realtimeEvents.vagaPreco);
  const recebidosFicou = collect(ficou, realtimeEvents.vagaPreco);
  t.app.get(RealtimeService).vagaPreco({ vagaId: 'v1', precoCentavos: 100 });
  await until(() => recebidosFicou.length === 1);
  await sleep(NAO_RECEBEU_MS);
  assert.equal(recebidosSaiu.length, 0);
});
