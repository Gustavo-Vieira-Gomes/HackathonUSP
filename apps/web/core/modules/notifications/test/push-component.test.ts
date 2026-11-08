import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

test('componente exportado não mostra convite antes da inscrição nem pede permissão na renderização', () => {
  // Client Component: renderizar em processo sem a condição react-server do runner.
  const output = execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--eval',
      `
    const { createElement } = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { PushPermission } = require('./core/modules/notifications/components/push-permission.tsx');
    console.log(JSON.stringify([false, true].map(subscribed =>
      renderToStaticMarkup(createElement(PushPermission, { subscribed })))));
  `,
    ],
    { encoding: 'utf8' },
  );
  const html: string[] = JSON.parse(output);
  assert.equal(html[0], '');
  assert.match(html[1] ?? '', /Notificações do navegador/);
  assert.doesNotMatch(html[1] ?? '', /button/);
});
