import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Base comum dos testes do modelo de dados (HACK-13, fatias 1 e 2): dados válidos
 * de cada modelo e leitura do código de erro do Prisma/Postgres. Cada arquivo de
 * teste cria o seu conjunto com `createSchemaFixtures`, com um marcador próprio no
 * e-mail dos `User`, para a limpeza de um arquivo não tocar no que o outro gravou.
 */

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function clinicData(userId: string) {
  return {
    userId,
    name: 'Clínica Teste',
    address: 'Av. Prof. Luciano Gualberto, 380',
    latitude: -23.5614,
    longitude: -46.7307,
    cnes: randomUUID().replace(/-/g, '').slice(0, 7),
    technicalManager: 'Dra. Teste, CRM 000000',
  };
}

export function examData(
  clinicId: string,
  overrides: Partial<{
    tussCode: string;
    fullPriceCents: number;
    floorPriceCents: number;
    minLeadMinutes: number;
    preparationHours: number;
    toleranceMinutes: number;
    maxTravelMinutes: number;
  }> = {},
) {
  return {
    clinicId,
    tussCode: '40901122',
    name: 'Ultrassonografia de abdome total',
    fullPriceCents: 30000,
    floorPriceCents: 18000,
    minLeadMinutes: 120,
    preparationCondition: 'jejum',
    preparationHours: 8,
    contraindications: [],
    toleranceMinutes: 15,
    maxTravelMinutes: 30,
    questionnaireKey: 'ultrassom-abdome-total',
    questionnaireVersion: 1,
    ...overrides,
  };
}

export function subscriptionData(patientId: string, tussCode = '40901122') {
  return {
    patientId,
    tussCode,
    maxPriceCents: 25000,
    latitude: -23.5614,
    longitude: -46.7307,
    radiusMeters: 5000,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

/** Código do Prisma (`P2002`…) ou SQLSTATE do Postgres, onde quer que o erro o carregue. */
export function errorCodes(
  error: unknown,
  seen = new Set<unknown>(),
): string[] {
  if (error === null || typeof error !== 'object' || seen.has(error)) return [];
  seen.add(error);
  const codes: string[] = [];
  const record = error as Record<string, unknown>;
  for (const key of ['code', 'originalCode']) {
    if (typeof record[key] === 'string') codes.push(record[key]);
  }
  if (typeof record.message === 'string') {
    codes.push(
      ...(record.message.match(/\b(?:P\d{4}|\d{5}|\d{2}P\d{2})\b/g) ?? []),
    );
  }
  for (const key of ['meta', 'cause', 'driverAdapterError']) {
    codes.push(...errorCodes(record[key], seen));
  }
  if (record.meta && typeof record.meta === 'object') {
    for (const value of Object.values(record.meta)) {
      codes.push(...errorCodes(value, seen));
    }
  }
  return codes;
}

/** Exige que a promessa rejeite carregando todos os códigos pedidos. */
export async function rejectsWith(
  promise: Promise<unknown>,
  ...expected: string[]
) {
  await assert.rejects(promise, (error: unknown) => {
    const codes = errorCodes(error);
    for (const code of expected) {
      assert.ok(
        codes.includes(code),
        `esperava ${code}, veio ${codes.join(', ') || String(error)}`,
      );
    }
    return true;
  });
}

export function createSchemaFixtures(prisma: PrismaService) {
  const suffix = `.${randomUUID().slice(0, 8)}@schema.teste.local`;
  const userIds: string[] = [];

  async function createUser(role: 'clinica' | 'paciente') {
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        name: `Teste ${role}`,
        email: `${randomUUID()}${suffix}`,
        role,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createClinic() {
    const user = await createUser('clinica');
    return prisma.clinic.create({ data: clinicData(user.id) });
  }

  async function createPatient() {
    const user = await createUser('paciente');
    return prisma.patient.create({
      data: {
        userId: user.id,
        phone: '+5511999990000',
        healthDataConsentAt: new Date(),
      },
    });
  }

  return { suffix, userIds, createUser, createClinic, createPatient };
}
