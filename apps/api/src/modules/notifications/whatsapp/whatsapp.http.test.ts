import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { after, before, test } from 'node:test';
import type { SimulatedWhatsappMessagesResponse } from '@hackathon/contracts';
import { DEMO_OPERATOR_TOKEN_HEADER } from '../../../common/guards/demo-operator.guard';
import {
  createSchemaFixtures,
  examData,
} from '../../../testing/schema-fixtures';
import {
  jsonRequest,
  startTestApp,
  type TestApp,
} from '../../../testing/test-app';
import { NotificationsService } from '../notifications.service';

/**
 * Critério do HACK-37: vaga publicada → a mensagem aparece em /demo/whatsapp no
 * mesmo ciclo do alerta. App montada com WHATSAPP_MODE=simulated contra o Postgres.
 */

const TOKEN = 'token-do-operador-da-demo-com-32-chars';

let on: TestApp;
let off: TestApp;
let fixtures: ReturnType<typeof createSchemaFixtures>;

before(async () => {
  on = await startTestApp({
    DEMO_CLOCK_ENABLED: 'true',
    DEMO_CLOCK_TOKEN: TOKEN,
    WHATSAPP_MODE: 'simulated',
  });
  off = await startTestApp({
    DEMO_CLOCK_ENABLED: 'true',
    DEMO_CLOCK_TOKEN: TOKEN,
  });
  fixtures = createSchemaFixtures(on.prisma);
});

after(async () => {
  const prisma = on.prisma;
  const ownClinic = { clinic: { userId: { in: fixtures.userIds } } };
  await prisma.alert.deleteMany({ where: { vacancy: { slot: ownClinic } } });
  await prisma.subscription.deleteMany({
    where: { patient: { userId: { in: fixtures.userIds } } },
  });
  await prisma.vacancy.deleteMany({ where: { slot: ownClinic } });
  await prisma.slot.deleteMany({ where: ownClinic });
  await prisma.exam.deleteMany({ where: ownClinic });
  await prisma.patient.deleteMany({
    where: { userId: { in: fixtures.userIds } },
  });
  await prisma.clinic.deleteMany({
    where: { userId: { in: fixtures.userIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: fixtures.userIds } } });
  await on.close();
  await off.close();
});

let seq = 0;

async function scenario(verified = true) {
  const prisma = on.prisma;
  const clinic = await fixtures.createClinic();
  const exam = await prisma.exam.create({
    data: examData(clinic.id, {
      tussCode: `4${String(++seq).padStart(7, '0')}`,
    }),
  });
  const patient = await fixtures.createPatient();
  const phone = `+55119${String(randomInt(0, 1e8)).padStart(8, '0')}`;
  await prisma.patient.update({
    where: { id: patient.id },
    data: {
      phone,
      alertChannels: ['push', 'whatsapp'],
      phoneVerifiedAt: verified ? new Date() : null,
    },
  });
  const startsAt = new Date('2027-01-16T13:00:00Z');
  const slot = await prisma.slot.create({
    data: {
      clinicId: clinic.id,
      examId: exam.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      origin: 'manual',
    },
  });
  const vacancy = await prisma.vacancy.create({
    data: { slotId: slot.id, origin: 'vazio', currentPriceCents: 25000 },
  });
  const subscription = await prisma.subscription.create({
    data: {
      patientId: patient.id,
      tussCode: exam.tussCode,
      maxPriceCents: 30000,
      latitude: clinic.latitude,
      longitude: clinic.longitude,
      radiusMeters: 5000,
      expiresAt: new Date('2027-12-31T00:00:00Z'),
    },
  });
  return {
    patientId: patient.id,
    phone,
    context: {
      vacancyId: vacancy.id,
      subscriptionId: subscription.id,
      wave: 1,
    },
    url: `https://app.example/vagas/${vacancy.id}`,
  };
}

const message = (url: string) => ({
  clinicName: 'Clínica Teste',
  examName: 'RM de joelho',
  startsAt: new Date('2027-01-16T13:00:00Z'),
  priceCents: 57600,
  distanceMeters: 2100,
  preparation: 'jejum de 4 h',
  vacancyUrl: url,
});

const listMessages = (
  app: TestApp,
  headers: Record<string, string> = { [DEMO_OPERATOR_TOKEN_HEADER]: TOKEN },
) => jsonRequest(app, 'GET', '/api/demo/whatsapp/messages', undefined, headers);

async function messagesTo(phone: string) {
  const response = await listMessages(on);
  assert.equal(response.status, 200);
  const body = (await response.json()) as SimulatedWhatsappMessagesResponse;
  return body.messages.filter((m) => m.phone === phone);
}

test('vaga publicada → mensagem aparece em /demo/whatsapp no mesmo ciclo, com o link', async () => {
  const { patientId, phone, context, url } = await scenario();
  const outcome = await on.app
    .get(NotificationsService)
    .enviar(patientId, message(url), context);
  assert.deepEqual(
    Object.fromEntries(outcome.map((o) => [o.channel, o.result])),
    { push: 'sem_adapter', whatsapp: 'enviado' },
  );
  const [received, ...rest] = await messagesTo(phone);
  assert.equal(rest.length, 0);
  assert.ok(received);
  assert.equal(received.kind, 'alerta');
  assert.ok(received.body.includes('*Vaga de RM de joelho*'));
  assert.ok(received.body.includes('Preparo: jejum de 4 h'));
  assert.ok(received.body.includes(url));
});

test('reenvio do mesmo alerta (pendente reivindicado) não duplica a mensagem', async () => {
  const { patientId, phone, context, url } = await scenario();
  const service = on.app.get(NotificationsService);
  await service.enviar(patientId, message(url), context);
  // Simula o processo que caiu depois de enviar: o Alert volta a pendente antigo.
  await on.prisma.alert.updateMany({
    where: { vacancyId: context.vacancyId, channel: 'whatsapp' },
    data: { result: 'pendente', createdAt: new Date(Date.now() - 60_000) },
  });
  const again = await service.enviar(patientId, message(url), context);
  assert.equal(again.find((o) => o.channel === 'whatsapp')?.result, 'enviado');
  assert.equal((await messagesTo(phone)).length, 1);
});

test('sem telefone verificado o WhatsApp não é usado', async () => {
  const { patientId, phone, context, url } = await scenario(false);
  const outcome = await on.app
    .get(NotificationsService)
    .enviar(patientId, message(url), context);
  assert.equal(
    outcome.some((o) => o.channel === 'whatsapp'),
    false,
  );
  assert.equal((await messagesTo(phone)).length, 0);
});

test('WHATSAPP_MODE=off: canal sem_adapter, nenhum Alert de WhatsApp e tela 404', async () => {
  const { patientId, context, url } = await scenario();
  const outcome = await off.app
    .get(NotificationsService)
    .enviar(patientId, message(url), context);
  assert.equal(
    outcome.find((o) => o.channel === 'whatsapp')?.result,
    'sem_adapter',
  );
  assert.equal(
    await on.prisma.alert.count({
      where: { vacancyId: context.vacancyId, channel: 'whatsapp' },
    }),
    0,
  );
  assert.equal((await listMessages(off)).status, 404);
});

test('a lista exige o token do operador: 401 sem, 403 errado', async () => {
  assert.equal((await listMessages(on, {})).status, 401);
  assert.equal(
    (await listMessages(on, { [DEMO_OPERATOR_TOKEN_HEADER]: `${TOKEN}x` }))
      .status,
    403,
  );
});
