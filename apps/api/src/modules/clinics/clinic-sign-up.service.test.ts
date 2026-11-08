import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { HttpException, Logger } from '@nestjs/common';
import type { SignUpService } from '../../auth/sign-up.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { ClinicSignUpService } from './clinic-sign-up.service';
import type { GeocodingService } from './geocoding.service';

test('H16-C40 - compensação que falha registra error com o id do User, sem e-mail, e devolve o erro original', async () => {
  const email = 'compensacao@teste.local';
  const original = Object.assign(new Error('unique'), { code: 'P2002' });
  const prisma = {
    clinic: {
      findUnique: async () => null,
      create: async () => {
        throw original;
      },
    },
    user: {
      delete: async () => {
        throw new Error('banco fora');
      },
    },
  } as unknown as PrismaService;
  const geocoding = {
    geocode: async () => ({ latitude: -23.5617, longitude: -46.656 }),
  } as unknown as GeocodingService;
  const signUps = {
    signUp: async () => ({
      body: {
        user: { id: 'user-123', name: 'C', email, role: 'clinica' as const },
      },
      setCookie: ['better-auth.session_token=x'],
    }),
  } as unknown as SignUpService;
  const service = new ClinicSignUpService(prisma, geocoding, signUps);
  const error = mock.method(Logger.prototype, 'error', () => undefined);
  const warn = mock.method(Logger.prototype, 'warn', () => undefined);
  try {
    await assert.rejects(
      service.signUp(
        {
          name: 'C',
          email,
          password: 'senha-forte-1',
          address: 'Av. Paulista, 1000',
          cnes: '1234567',
          technicalManager: 'Dra. Teste, CRM 1',
          openingHours: [{ weekday: 1, startMinute: 480, endMinute: 1080 }],
        },
        {},
      ),
      (thrown) => thrown === original,
    );
    assert.equal(error.mock.callCount(), 1);
    const line = error.mock.calls[0]!.arguments.map(String).join(' ');
    assert.ok(line.includes('user-123'), line);
    const all = [...error.mock.calls, ...warn.mock.calls]
      .map((call) => call.arguments.map(String).join(' '))
      .join('\n');
    assert.ok(!all.includes(email), all);
  } finally {
    error.mock.restore();
    warn.mock.restore();
  }
});

test('HACK-50 - falha ao concluir recuperação não apaga a conta existente', async () => {
  let deleted = false;
  const failure = new Error('banco indisponível');
  const prisma = {
    clinic: {
      findUnique: async () => null,
      create: async () => {
        throw failure;
      },
    },
    user: {
      delete: async () => {
        deleted = true;
      },
    },
  } as unknown as PrismaService;
  const geocoding = {
    geocode: async () => ({ latitude: -23, longitude: -46 }),
  } as unknown as GeocodingService;
  const signUps = {
    signUp: async () => {
      throw new HttpException(
        { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' },
        422,
      );
    },
    signIn: async () => ({
      body: {
        user: {
          id: 'existing',
          name: 'C',
          email: 'retry@teste.local',
          role: 'clinica',
        },
      },
      setCookie: [],
    }),
  } as unknown as SignUpService;
  const service = new ClinicSignUpService(prisma, geocoding, signUps);
  await assert.rejects(
    service.signUp(
      {
        name: 'C',
        email: 'retry@teste.local',
        password: 'senha-forte-1',
        address: 'Av. Paulista, 1000',
        cnes: '1234567',
        technicalManager: 'CRM 1',
        openingHours: [{ weekday: 1, startMinute: 480, endMinute: 1080 }],
      },
      {},
    ),
    (error) => error === failure,
  );
  assert.equal(deleted, false);
});
