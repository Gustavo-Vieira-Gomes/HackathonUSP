import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { clinicProfileSchema, clinicVacancySchema } from '@hackathon/contracts';
import { examData } from '../../testing/schema-fixtures';
import {
  jsonRequest,
  signUpWithCookie,
  startTestApp,
  type TestApp,
} from '../../testing/test-app';
import { ClinicGuard } from './clinic.guard';
import { ClinicSignUpService } from './clinic-sign-up.service';
import { ClinicsModule } from './clinics.module';

type Account = Awaited<ReturnType<typeof signUpWithCookie>>;

let t: TestApp;
let a: Account;
let b: Account;
let vacancyA: string;
let vacancyB: string;
const examIds: string[] = [];
const slotIds: string[] = [];
const vacancyIds: string[] = [];

async function createVacancy(clinicId: string) {
  const exam = await t.prisma.exam.create({ data: examData(clinicId) });
  examIds.push(exam.id);
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const slot = await t.prisma.slot.create({
    data: {
      clinicId,
      examId: exam.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
      origin: 'manual',
    },
  });
  slotIds.push(slot.id);
  const vacancy = await t.prisma.vacancy.create({
    data: { slotId: slot.id, origin: 'cancelamento', currentPriceCents: 24000 },
  });
  vacancyIds.push(vacancy.id);
  return vacancy.id;
}

before(async () => {
  t = await startTestApp();
  a = await signUpWithCookie(t, 'clinica');
  b = await signUpWithCookie(t, 'clinica');
  assert.ok(a.clinicId && b.clinicId);
  vacancyA = await createVacancy(a.clinicId);
  vacancyB = await createVacancy(b.clinicId);
});

after(async () => {
  await t.prisma.vacancy.deleteMany({ where: { id: { in: vacancyIds } } });
  await t.prisma.slot.deleteMany({ where: { id: { in: slotIds } } });
  await t.prisma.exam.deleteMany({ where: { id: { in: examIds } } });
  await t.close();
});

const get = (path: string, headers: Record<string, string> = {}) =>
  jsonRequest(t, 'GET', path, undefined, headers);

const NOT_FOUND = { code: 'NOT_FOUND', message: 'Vaga não encontrada.' };

test('H16-C19 - vaga de outra clínica responde 404 NOT_FOUND sem nenhum campo da vaga', async () => {
  const response = await get(`/api/clinic/vacancies/${vacancyB}`, {
    cookie: a.cookie,
  });
  assert.equal(response.status, 404);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), NOT_FOUND);
  assert.ok(!text.includes(vacancyB));
});

test('H16-C20 - vaga própria responde 200 com os campos do banco no formato do contrato', async () => {
  const response = await get(`/api/clinic/vacancies/${vacancyA}`, {
    cookie: a.cookie,
  });
  assert.equal(response.status, 200);
  const body = clinicVacancySchema.parse(await response.json());
  const stored = await t.prisma.vacancy.findUniqueOrThrow({
    where: { id: vacancyA },
    include: { slot: true },
  });
  assert.deepEqual(body, {
    id: stored.id,
    state: stored.state,
    origin: stored.origin,
    currentPriceCents: stored.currentPriceCents,
    slot: {
      startsAt: stored.slot.startsAt.toISOString(),
      endsAt: stored.slot.endsAt.toISOString(),
      examId: stored.slot.examId,
    },
  });
});

test('H16-C21 - id que não é uuid ou não existe responde 404 com o mesmo corpo', async () => {
  const ids = ['abc', randomUUID()];
  for (const id of ids) {
    const response = await get(`/api/clinic/vacancies/${id}`, {
      cookie: a.cookie,
    });
    assert.equal(response.status, 404, id);
    assert.deepEqual(await response.json(), NOT_FOUND, id);
  }
  assert.equal(ids.length, 2);
});

const routes = () => ['/api/clinic/me', `/api/clinic/vacancies/${vacancyA}`];

test('H16-C22 - sem sessão as rotas de clínica respondem 401', async () => {
  for (const path of routes()) {
    assert.equal((await get(path)).status, 401, path);
  }
});

test('H16-C23 - sessão de paciente responde 403 nas rotas de clínica', async () => {
  const patient = await signUpWithCookie(t, 'paciente');
  for (const path of routes()) {
    const response = await get(path, { cookie: patient.cookie });
    assert.equal(response.status, 403, path);
  }
});

test('H16-C24 - conta clinica sem Clinic responde 403 CLINIC_PROFILE_MISSING', async () => {
  const orphan = await signUpWithCookie(t, 'clinica');
  await t.prisma.clinic.delete({ where: { userId: orphan.id } });
  for (const path of routes()) {
    const response = await get(path, { cookie: orphan.cookie });
    assert.equal(response.status, 403, path);
    const body = (await response.json()) as { code?: string };
    assert.equal(body.code, 'CLINIC_PROFILE_MISSING', path);
  }
});

test('H16-C25 - /clinic/me devolve a clínica da sessão mesmo com id da outra na query e no header', async () => {
  const response = await get(`/api/clinic/me?clinicId=${b.clinicId}`, {
    cookie: a.cookie,
    'x-clinic-id': b.clinicId!,
  });
  assert.equal(response.status, 200);
  const profile = clinicProfileSchema.parse(await response.json());
  const stored = await t.prisma.clinic.findUniqueOrThrow({
    where: { id: a.clinicId },
    include: { openingHours: true },
  });
  assert.equal(profile.id, a.clinicId);
  assert.equal(profile.cnes, stored.cnes);
  const order = (h: { weekday: number; startMinute: number }) =>
    h.weekday * 1440 + h.startMinute;
  assert.deepEqual(
    profile.openingHours,
    stored.openingHours
      .sort((x, y) => order(x) - order(y))
      .map(({ weekday, startMinute, endMinute }) => ({
        weekday,
        startMinute,
        endMinute,
      })),
  );
  const other = await t.prisma.clinic.findUniqueOrThrow({
    where: { id: b.clinicId },
  });
  assert.notEqual(profile.cnes, other.cnes);
});

test('H16-C26 - ClinicsModule exporta o ClinicGuard e a aplicação resolve guard e cadastro', () => {
  const exported = Reflect.getMetadata('exports', ClinicsModule) as unknown[];
  assert.ok(exported.includes(ClinicGuard));
  assert.ok(t.app.get(ClinicGuard) instanceof ClinicGuard);
  assert.ok(t.app.get(ClinicSignUpService) instanceof ClinicSignUpService);
});
