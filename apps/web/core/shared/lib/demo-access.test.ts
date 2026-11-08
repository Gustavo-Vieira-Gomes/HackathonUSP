import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDemoAccess } from './demo-access';

const TOKEN = 'segredo-do-operador-com-32-caracteres';
const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

test('sem segredo configurado no Next, a demo não existe', () => {
  assert.equal(checkDemoAccess(basic('operador', TOKEN), ''), 'disabled');
  assert.equal(
    checkDemoAccess(basic('operador', TOKEN), undefined),
    'disabled',
  );
});

test('sem cabeçalho ou com outro esquema: missing', () => {
  assert.equal(checkDemoAccess(null, TOKEN), 'missing');
  assert.equal(checkDemoAccess('', TOKEN), 'missing');
  assert.equal(checkDemoAccess(`Bearer ${TOKEN}`, TOKEN), 'missing');
});

test('senha igual ao segredo libera, com qualquer usuário', () => {
  assert.equal(checkDemoAccess(basic('operador', TOKEN), TOKEN), 'ok');
  assert.equal(checkDemoAccess(basic('', TOKEN), TOKEN), 'ok');
});

test('senha errada, parecida ou sem separador: denied', () => {
  for (const header of [
    basic('operador', `${TOKEN}x`),
    basic('operador', TOKEN.slice(0, -1)),
    basic(TOKEN, ''),
    `Basic ${Buffer.from(TOKEN).toString('base64')}`,
    'Basic !!!não-é-base64!!!',
  ]) {
    assert.equal(checkDemoAccess(header, TOKEN), 'denied', header);
  }
});
