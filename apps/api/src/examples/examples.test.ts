import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { startTestApp, type TestApp } from '../testing/test-app';
import { EXAMPLE_JOB_NAME, ExampleJob } from './example.job';

let t: TestApp;
before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.close();
});

test('C34 - job de exemplo registrado a cada minuto e log sem dado de usuário', () => {
  const job = t.app.get(SchedulerRegistry).getCronJob(EXAMPLE_JOB_NAME);
  assert.equal(job.cronTime.source, '0 * * * * *');

  const log = mock.method(Logger.prototype, 'log', () => undefined);
  try {
    t.app.get(ExampleJob).run();
    assert.equal(log.mock.callCount(), 1);
    const line = String(log.mock.calls[0]?.arguments[0]);
    assert.match(line, new RegExp(EXAMPLE_JOB_NAME));
    assert.doesNotMatch(line, /@|cookie|session_token|\bid\b/i);
  } finally {
    log.mock.restore();
  }
});

test('C35 - cliente socket.io emite ping e recebe pong', async () => {
  const wsUrl = `${t.url.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;
  const socket = new WebSocket(wsUrl);
  const received: string[] = [];
  const pong = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`sem pong: ${received.join(' | ')}`)),
      5000,
    );
    socket.addEventListener('error', () =>
      reject(new Error('falha no WebSocket')),
    );
    socket.addEventListener('message', (event) => {
      const data = String(event.data);
      received.push(data);
      // Protocolo socket.io v5 sobre engine.io v4: 0 = open, 40 = connect, 42 = evento.
      if (data.startsWith('0{')) socket.send('40');
      else if (data.startsWith('40')) socket.send('42["ping"]');
      else if (data.startsWith('42')) {
        clearTimeout(timer);
        resolve(data);
      }
    });
  });
  try {
    const message = await pong;
    const [event] = JSON.parse(message.slice(2)) as [string, unknown];
    assert.equal(event, 'pong');
  } finally {
    socket.close();
  }
});
