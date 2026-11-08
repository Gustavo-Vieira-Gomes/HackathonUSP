import assert from 'node:assert/strict';
import test from 'node:test';
import { clinicSignUpBodySchema } from './clinic';

const valid = {
  name: 'Clínica Imagem Paulista',
  email: 'contato@clinica.test',
  password: 'senha-forte-1',
  address: 'Av. Paulista, 1000',
  cnes: '1234567',
  technicalManager: 'Dra. Ana Lima, CRM 123456',
  openingHours: [{ weekday: 1, startMinute: 480, endMinute: 1080 }],
};

function paths(body: unknown): string[] {
  const result = clinicSignUpBodySchema.safeParse(body);
  assert.equal(result.success, false, 'o corpo deveria ser recusado');
  return result.error!.issues.map((issue) => issue.path.join('.'));
}

function accepts(body: unknown, label: string) {
  const result = clinicSignUpBodySchema.safeParse(body);
  assert.equal(result.success, true, `${label}: ${result.error?.message}`);
}

test('H16-C3 - recusa CNES, endereço, responsável, nome e senha fora do limite e aceita os limites', () => {
  const refused: [Record<string, unknown>, string][] = [
    [{ cnes: '123456' }, 'cnes'],
    [{ cnes: '12345678' }, 'cnes'],
    [{ cnes: '12345a7' }, 'cnes'],
    [{ address: '  Rua  ' }, 'address'],
    [{ technicalManager: ' Dr ' }, 'technicalManager'],
    [{ name: '    ' }, 'name'],
    [{ password: '1234567' }, 'password'],
  ];
  for (const [override, field] of refused) {
    assert.ok(
      paths({ ...valid, ...override }).includes(field),
      `${JSON.stringify(override)} → ${field}`,
    );
  }
  assert.equal(refused.length, 7);

  const accepted: Record<string, unknown>[] = [
    { cnes: '1234567' },
    { address: 'Rua 1' },
    { technicalManager: 'Dra' },
  ];
  for (const override of accepted) {
    accepts({ ...valid, ...override }, JSON.stringify(override));
  }
  assert.equal(accepted.length, 3);
});

test('H16-C4 - recusa expediente inválido com o caminho da faixa e aceita os limites', () => {
  const range = (weekday: number, startMinute: number, endMinute: number) => ({
    weekday,
    startMinute,
    endMinute,
  });
  const fifteen = Array.from({ length: 15 }, (_, i) =>
    range(i % 7, (i % 2) * 600, (i % 2) * 600 + 300),
  );
  const refused: [unknown[], string][] = [
    [[], 'openingHours'],
    [[range(1, 600, 600)], 'openingHours.0.endMinute'],
    [[range(7, 480, 600)], 'openingHours.0.weekday'],
    [[range(-1, 480, 600)], 'openingHours.0.weekday'],
    [[range(1, 480, 1441)], 'openingHours.0.endMinute'],
    [fifteen, 'openingHours'],
    [[range(2, 480, 720), range(2, 700, 900)], 'openingHours.1.startMinute'],
  ];
  for (const [openingHours, field] of refused) {
    assert.ok(
      paths({ ...valid, openingHours }).includes(field),
      `${JSON.stringify(openingHours).slice(0, 80)} → ${field}`,
    );
  }
  assert.equal(refused.length, 7);

  const accepted: unknown[][] = [
    [range(1, 0, 600)],
    [range(1, 600, 1440)],
    [range(0, 480, 600), range(6, 480, 600)],
    [range(3, 480, 720), range(3, 720, 900)],
  ];
  for (const openingHours of accepted) {
    accepts({ ...valid, openingHours }, JSON.stringify(openingHours));
  }
  assert.equal(accepted.length, 4);
});
