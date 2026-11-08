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
