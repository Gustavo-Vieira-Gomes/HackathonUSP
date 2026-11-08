import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { clinicVacanciesSchema, examSchema } from '@hackathon/contracts';
import { examBody, deleteExamsOf } from '../../testing/exam-fixtures';
import {
  jsonRequest,
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';
import { ClockService } from '../clock/clock.service';
import { VacanciesService } from '../vacancies/vacancies.service';
import { NoShowMotorService } from './no-show-motor.service';

let t: TestApp;
const clinics: string[] = [];
before(async () => {
  t = await startTestApp();
});
after(async () => {
  const slots = await t.prisma.slot.findMany({
    where: { clinicId: { in: clinics } },
    select: { id: true },
  });
  const slotIds = slots.map((s) => s.id);
  const vacancies = await t.prisma.vacancy.findMany({
    where: { slotId: { in: slotIds } },
    select: { id: true },
  });
  const vacancyIds = vacancies.map((v) => v.id);
  const reservations = await t.prisma.reservation.findMany({
    where: { slotId: { in: slotIds } },
    select: { id: true, patientId: true },
  });
  await t.prisma.transition.deleteMany({
    where: { reservationId: { in: reservations.map((r) => r.id) } },
  });
  await t.prisma.reservation.deleteMany({
    where: { id: { in: reservations.map((r) => r.id) } },
  });
  await t.prisma.patient.deleteMany({
    where: { id: { in: reservations.map((r) => r.patientId) } },
  });
  await t.prisma.transition.deleteMany({
    where: { vacancyId: { in: vacancyIds } },
  });
  await t.prisma.vacancy.deleteMany({ where: { id: { in: vacancyIds } } });
  await t.prisma.slot.deleteMany({ where: { id: { in: slotIds } } });
  await deleteExamsOf(t.prisma, clinics);
  await t.close();
});

test('H20 HTTP: autenticação, validação, preço inicial, isolamento e sexta vaga recusada', async () => {
  assert.equal(
    (await jsonRequest(t, 'GET', '/api/clinic/vacancies')).status,
    401,
  );
  const clinic = await signUpWithCookie(t, 'clinica');
  assert.ok(clinic.clinicId);
  clinics.push(clinic.clinicId);
  const response = await jsonRequest(
    t,
    'POST',
    '/api/clinic/exams',
    examBody(),
    { cookie: clinic.cookie },
  );
  assert.equal(response.status, 201);
  const exam = examSchema.parse(await response.json());
  const now = t.app.get(ClockService).now();
  const body = {
    examId: exam.id,
    startsAt: new Date(now.getTime() + 12 * 3600000).toISOString(),
    endsAt: new Date(now.getTime() + 13 * 3600000).toISOString(),
    reason: 'vazio',
  };
  const post = (data: unknown) =>
    jsonRequest(t, 'POST', '/api/clinic/vacancies', data, {
      cookie: clinic.cookie,
    });
  assert.equal(
    (await post({ ...body, clinicId: clinic.clinicId })).status,
    422,
  );
  assert.equal((await post({ ...body, endsAt: body.startsAt })).status, 422);
  for (let i = 0; i < 5; i++) assert.equal((await post(body)).status, 201);
  const sixth = await post(body);
  assert.equal(sixth.status, 422);
  const refusal = (await sixth.json()) as { cap: number };
  assert.equal(refusal.cap, 5);
  assert.equal(
    await t.prisma.slot.count({ where: { clinicId: clinic.clinicId } }),
    5,
  );
  const list = await jsonRequest(t, 'GET', '/api/clinic/vacancies', undefined, {
    cookie: clinic.cookie,
  });
  assert.equal(list.status, 200);
  const result = clinicVacanciesSchema.parse(await list.json());
  assert.equal(result.vacancies.length, 5);
  assert.equal(result.vacancies[0]?.currentPriceCents, 57600);
  const other = await signUpWithCookie(t, 'clinica');
  assert.ok(other.clinicId);
  clinics.push(other.clinicId);
  const otherList = await jsonRequest(
    t,
    'GET',
    '/api/clinic/vacancies',
    undefined,
    { cookie: other.cookie },
  );
  assert.equal(
    clinicVacanciesSchema.parse(await otherList.json()).vacancies.length,
    0,
  );
  assert.equal(
    (
      await jsonRequest(t, 'POST', '/api/clinic/vacancies', body, {
        cookie: other.cookie,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await jsonRequest(
        t,
        'POST',
        '/api/clinic/reservations/not-a-uuid/no-show',
        undefined,
        { cookie: other.cookie },
      )
    ).status,
    404,
  );
});

test('H20 HTTP: no-show usa relógio, isola clínica, retém sinal e cancela vaga anterior', async () => {
  const clinic = await signUpWithCookie(t, 'clinica');
  assert.ok(clinic.clinicId);
  clinics.push(clinic.clinicId);
  const examResponse = await jsonRequest(
    t,
    'POST',
    '/api/clinic/exams',
    examBody(),
    { cookie: clinic.cookie },
  );
  const exam = examSchema.parse(await examResponse.json());
  const patient = await signUpWithCookie(t, 'paciente');
  const profile = await t.prisma.patient.create({
    data: {
      userId: patient.id,
      phone: '+5511999999999',
      healthDataConsentAt: new Date(),
    },
  });
  const slot = await t.prisma.slot.create({
    data: {
      clinicId: clinic.clinicId,
      examId: exam.id,
      startsAt: new Date('2026-11-08T17:00:00Z'),
      endsAt: new Date('2026-11-08T18:00:00Z'),
      origin: 'manual',
    },
  });
  const vacancies = t.app.get(VacanciesService);
  const vacancy = await vacancies.publish(
    { slotId: slot.id, origin: 'vazio', currentPriceCents: 50000 },
    { origin: 'clinica', reason: 'Cenário HTTP no-show' },
  );
  await vacancies.transition(vacancy.id, 'reservada', {
    origin: 'paciente',
    reason: 'Reserva de teste',
  });
  const reservation = await t.prisma.reservation.create({
    data: {
      slotId: slot.id,
      vacancyId: vacancy.id,
      patientId: profile.id,
      type: 'encaixe',
      state: 'confirmada',
      chargedPriceCents: 50000,
      depositCents: 10000,
      paymentMethod: 'pix',
    },
  });
  const other = await signUpWithCookie(t, 'clinica');
  assert.ok(other.clinicId);
  clinics.push(other.clinicId);
  const path = `/api/clinic/reservations/${reservation.id}/no-show`;
  assert.equal(
    (await jsonRequest(t, 'POST', path, undefined, { cookie: other.cookie }))
      .status,
    404,
  );
  assert.equal(
    (await jsonRequest(t, 'POST', path, undefined, { cookie: patient.cookie }))
      .status,
    403,
  );
  const clock = t.app.get(ClockService);
  const originalNow = clock.now;
  const motor = t.app.get(NoShowMotorService);
  const originalHook = motor.onDeclared;
  let hookCalls = 0;
  motor.onDeclared = async (tx, declared) => {
    assert.equal(declared.id, reservation.id);
    assert.equal(
      (await tx.reservation.findUniqueOrThrow({ where: { id: declared.id } }))
        .state,
      'no_show',
    );
    hookCalls++;
  };
  const get = async () =>
    clinicVacanciesSchema.parse(
      await (
        await jsonRequest(t, 'GET', '/api/clinic/vacancies', undefined, {
          cookie: clinic.cookie,
        })
      ).json(),
    );
  try {
    clock.now = () => new Date('2026-11-08T17:10:00Z');
    assert.equal((await get()).reservations[0]?.canDeclareNoShow, false);
    assert.equal(
      (await jsonRequest(t, 'POST', path, undefined, { cookie: clinic.cookie }))
        .status,
      422,
    );
    clock.now = () => new Date('2026-11-08T17:16:00Z');
    assert.equal((await get()).reservations[0]?.canDeclareNoShow, true);
    const response = await jsonRequest(t, 'POST', path, undefined, {
      cookie: clinic.cookie,
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      id: reservation.id,
      state: 'no_show',
    });
    const stored = await t.prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    assert.equal(stored.state, 'no_show');
    assert.equal(stored.depositCents, 10000);
    assert.equal(
      (await t.prisma.vacancy.findUniqueOrThrow({ where: { id: vacancy.id } }))
        .state,
      'cancelada',
    );
    assert.equal(
      await t.prisma.transition.count({
        where: {
          reservationId: reservation.id,
          toState: 'no_show',
          origin: 'clinica',
        },
      }),
      1,
    );
    assert.equal(
      await t.prisma.transition.count({
        where: {
          vacancyId: vacancy.id,
          toState: 'cancelada',
          origin: 'clinica',
        },
      }),
      1,
    );
    assert.equal((await get()).reservations[0]?.canDeclareNoShow, false);
    assert.equal(
      (await jsonRequest(t, 'POST', path, undefined, { cookie: clinic.cookie }))
        .status,
      409,
    );
    assert.equal(hookCalls, 1);
  } finally {
    clock.now = originalNow;
    motor.onDeclared = originalHook;
  }
});
