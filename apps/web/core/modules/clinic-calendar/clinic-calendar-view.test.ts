import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { GoogleCalendarItem } from '@hackathon/contracts';
import {
  closedPortUrl,
  type FakeReply,
  startFakeApi,
} from '../../shared/services/fake-api.test-helper';
import { getCalendarConnection } from './clinic-calendar.service';
import {
  CALLBACK_ALERTS,
  COPY,
  clinicCalendarView,
} from './clinic-calendar-view';

const COOKIE = 'better-auth.session_token=abc.def';
let reply: FakeReply = { status: 500 };
let api: Awaited<ReturnType<typeof startFakeApi>>;
before(async () => {
  api = await startFakeApi(() => reply);
});
after(() => api.close());

const json = (status: number, body: unknown): FakeReply => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const STATUS_TEXTS = [
  COPY.connected,
  COPY.disconnected,
  COPY.expired,
  COPY.awaiting,
];

const calendars: GoogleCalendarItem[] = [
  { id: 'principal@x', name: 'Agenda principal', primary: true },
  { id: 'exames@x', name: 'Exames', primary: false },
];

test('H18-C6 - 503 GOOGLE_CALENDAR_UNAVAILABLE: tela indisponível, sem botão nem lista', async () => {
  reply = json(503, { code: 'GOOGLE_CALENDAR_UNAVAILABLE', message: 'x' });
  const load = await getCalendarConnection(COOKIE, { baseUrl: api.url });
  assert.deepEqual(load, { kind: 'unavailable' });
  const view = clinicCalendarView(load, undefined);
  assert.equal(
    view.notice,
    'Integração com a Google Agenda indisponível neste ambiente',
  );
  assert.equal(view.showConnect, false);
  assert.equal(view.calendars, undefined);
  assert.equal(view.statusText, undefined);
});

test('H18-C27 - a tela por status: conectada, desconectada, expirada e escolha da agenda', () => {
  const connected = clinicCalendarView(
    {
      kind: 'ok',
      connection: {
        status: 'connected',
        calendarName: 'Exames',
        connectedAt: '2026-11-08T12:00:00.000Z',
      },
    },
    undefined,
  );
  assert.equal(connected.statusText, 'Conectada');
  assert.equal(connected.calendarName, 'Exames');
  assert.equal(connected.showConnect, false);

  const disconnected = clinicCalendarView(
    { kind: 'ok', connection: { status: 'disconnected' } },
    undefined,
  );
  assert.equal(disconnected.statusText, 'Desconectada');
  assert.equal(disconnected.showConnect, true);
  assert.equal(COPY.connectButton, 'Conectar Google Agenda');

  const expired = clinicCalendarView(
    { kind: 'ok', connection: { status: 'expired' } },
    undefined,
  );
  assert.equal(
    expired.statusText,
    'Agenda desconectada: a autorização expirou ou foi revogada. Reautorize.',
  );
  assert.equal(expired.showConnect, true);

  const awaiting = clinicCalendarView(
    { kind: 'ok', connection: { status: 'awaiting_calendar' } },
    { ok: true, calendars },
  );
  assert.deepEqual(awaiting.calendars, calendars);
  assert.equal(awaiting.showConnect, false);
  assert.equal(COPY.useButton, 'Usar esta agenda');
});

test('H18-C28 - escolha com a lista vazia: aviso de nenhuma agenda própria e sem lista', () => {
  const view = clinicCalendarView(
    { kind: 'ok', connection: { status: 'awaiting_calendar' } },
    { ok: true, calendars: [] },
  );
  assert.equal(
    view.emptyText,
    'Nenhuma agenda própria encontrada nesta conta Google',
  );
  assert.equal(view.calendars, undefined);
});

test('H18-C29 - API fora do ar, 500 ou fora do contrato: erro de carga e nenhum status', async () => {
  const cases: [string, () => Promise<string>][] = [
    ['fora do ar', closedPortUrl],
    [
      '500',
      async () => {
        reply = json(500, { message: 'x' });
        return api.url;
      },
    ],
    [
      'fora do contrato',
      async () => {
        reply = json(200, { status: 'conectada' });
        return api.url;
      },
    ],
  ];
  for (const [label, prepare] of cases) {
    const load = await getCalendarConnection(COOKIE, {
      baseUrl: await prepare(),
    });
    const view = clinicCalendarView(load, undefined);
    assert.equal(
      view.notice,
      'Não foi possível carregar o status da agenda. Tente de novo.',
      label,
    );
    assert.equal(view.statusText, undefined, label);
    assert.equal(view.showConnect, false, label);
    for (const text of STATUS_TEXTS) {
      assert.notEqual(view.notice, text, label);
    }
  }
});

test('H18-C30 - ?google= de erro dá alerta próprio; sucesso, desconhecido e ausente não alertam', () => {
  const load = { kind: 'ok', connection: { status: 'disconnected' } } as const;
  const errors = [
    'denied',
    'invalid_state',
    'no_refresh_token',
    'google_unavailable',
  ];
  const alerts = errors.map(
    (google) => clinicCalendarView(load, undefined, google).alert,
  );
  for (const [index, alert] of alerts.entries()) {
    assert.ok(alert && alert.length > 0, errors[index]);
    assert.equal(alert, CALLBACK_ALERTS[errors[index] ?? '']);
  }
  assert.equal(new Set(alerts).size, 4);
  for (const google of ['awaiting_calendar', 'qualquer', undefined]) {
    assert.equal(
      clinicCalendarView(load, undefined, google).alert,
      undefined,
      String(google),
    );
  }
});
