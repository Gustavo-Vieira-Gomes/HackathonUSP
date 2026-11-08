import assert from 'node:assert/strict';
import test from 'node:test';
import {
  realtimeAckSchema,
  realtimeEvents,
  realtimeServerEventSchemas,
  reservaCriadaEventSchema,
  vagaAssinaturaSchema,
  vagaPrecoEventSchema,
  vagaPublicadaEventSchema,
  vagaReservadaEventSchema,
} from './index';

const em = '2026-11-08T12:00:00.000Z';

test('C21 - schemas dos eventos de tempo real aceitam a forma da porta 2 e recusam o resto', () => {
  assert.deepEqual(
    { ...realtimeEvents },
    {
      vagaPublicada: 'vaga.publicada',
      vagaPreco: 'vaga.preco',
      vagaReservada: 'vaga.reservada',
      reservaCriada: 'reserva.criada',
      vagaAssinar: 'vaga.assinar',
      vagaSair: 'vaga.sair',
    },
  );
  assert.deepEqual(Object.keys(realtimeServerEventSchemas).sort(), [
    'reserva.criada',
    'vaga.preco',
    'vaga.publicada',
    'vaga.reservada',
  ]);

  // Aceitos: exemplos literais da porta 2.
  assert.ok(vagaPublicadaEventSchema.safeParse({ vagaId: 'v1', em }).success);
  assert.ok(
    vagaPrecoEventSchema.safeParse({ vagaId: 'v1', precoCentavos: 50400, em })
      .success,
  );
  assert.ok(
    vagaPrecoEventSchema.safeParse({ vagaId: 'v1', precoCentavos: 0, em })
      .success,
  );
  assert.ok(vagaReservadaEventSchema.safeParse({ vagaId: 'v1', em }).success);
  assert.ok(
    reservaCriadaEventSchema.safeParse({ reservaId: 'r1', vagaId: 'v1', em })
      .success,
  );
  assert.ok(vagaAssinaturaSchema.safeParse({ vagaId: 'v1' }).success);
  assert.ok(vagaAssinaturaSchema.safeParse({ vagaId: 'x'.repeat(64) }).success);
  assert.ok(realtimeAckSchema.safeParse({ ok: true }).success);
  assert.ok(
    realtimeAckSchema.safeParse({ ok: false, erro: 'payload_invalido' })
      .success,
  );
  assert.ok(
    realtimeAckSchema.safeParse({ ok: false, erro: 'limite_assinaturas' })
      .success,
  );

  // Recusados.
  const recusados: Array<
    [string, { safeParse(v: unknown): { success: boolean } }, unknown]
  > = [
    [
      'precoCentavos -1',
      vagaPrecoEventSchema,
      { vagaId: 'v1', precoCentavos: -1, em },
    ],
    [
      'precoCentavos 1.5',
      vagaPrecoEventSchema,
      { vagaId: 'v1', precoCentavos: 1.5, em },
    ],
    ['em ontem', vagaPublicadaEventSchema, { vagaId: 'v1', em: 'ontem' }],
    ['vagaId vazio', vagaAssinaturaSchema, { vagaId: '' }],
    ['vagaId 65', vagaAssinaturaSchema, { vagaId: 'x'.repeat(65) }],
    ['ack erro outro', realtimeAckSchema, { ok: false, erro: 'outro' }],
    [
      'vaga.reservada com campo extra',
      vagaReservadaEventSchema,
      { vagaId: 'v1', em, pacienteId: 'p1' },
    ],
  ];
  for (const [nome, schema, valor] of recusados) {
    assert.equal(schema.safeParse(valor).success, false, nome);
  }
});
