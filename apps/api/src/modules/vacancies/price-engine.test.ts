import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { currentPriceCents, type PriceStep } from './price-engine';

const defaultSteps: PriceStep[] = [
  { leadMinutes: 48 * 60, discountPercent: 10 },
  { leadMinutes: 24 * 60, discountPercent: 20 },
  { leadMinutes: 6 * 60, discountPercent: 30 },
];
const exam = {
  fullPriceCents: 72000,
  floorPriceCents: 50000,
  steps: defaultSteps,
};

describe('currentPriceCents', () => {
  it('faltando 30 h só o degrau de -10% foi alcançado: R$ 648', () => {
    assert.equal(
      currentPriceCents({ ...exam, minutesUntilStart: 30 * 60 }),
      64800,
    );
  });

  it('faltando 20 h o degrau de -20% vale: R$ 576', () => {
    assert.equal(
      currentPriceCents({ ...exam, minutesUntilStart: 20 * 60 }),
      57600,
    );
  });

  it('faltando 5 h o degrau de -30% cairia para R$ 504, acima do piso', () => {
    assert.equal(
      currentPriceCents({ ...exam, minutesUntilStart: 5 * 60 }),
      50400,
    );
  });

  it('piso acima do preço com desconto vale como preço: R$ 600', () => {
    assert.equal(
      currentPriceCents({
        ...exam,
        floorPriceCents: 60000,
        minutesUntilStart: 5 * 60,
      }),
      60000,
    );
  });

  it('degrau de -40% com piso R$ 500 resulta em R$ 500', () => {
    assert.equal(
      currentPriceCents({
        ...exam,
        steps: [{ leadMinutes: 6 * 60, discountPercent: 40 }],
        minutesUntilStart: 60,
      }),
      50000,
    );
  });

  it('antes do primeiro degrau cobra o preço cheio', () => {
    assert.equal(
      currentPriceCents({ ...exam, minutesUntilStart: 72 * 60 }),
      72000,
    );
  });

  it('exatamente no limite do degrau o desconto já vale', () => {
    assert.equal(
      currentPriceCents({ ...exam, minutesUntilStart: 48 * 60 }),
      64800,
    );
  });

  it('horário já iniciado mantém o último degrau', () => {
    assert.equal(currentPriceCents({ ...exam, minutesUntilStart: -30 }), 50400);
  });

  it('sem degraus o preço fica no cheio', () => {
    assert.equal(
      currentPriceCents({ ...exam, steps: [], minutesUntilStart: 60 }),
      72000,
    );
  });

  it('nunca sobe com o tempo, mesmo com degraus fora de ordem', () => {
    const steps: PriceStep[] = [
      { leadMinutes: 48 * 60, discountPercent: 30 },
      { leadMinutes: 6 * 60, discountPercent: 10 },
    ];
    let previous = Infinity;
    for (let minutes = 72 * 60; minutes >= 0; minutes -= 15) {
      const price = currentPriceCents({
        ...exam,
        steps,
        minutesUntilStart: minutes,
      });
      assert.ok(price <= previous, `subiu em ${minutes} min`);
      previous = price;
    }
  });

  it('arredonda para centavo inteiro', () => {
    assert.equal(
      currentPriceCents({
        fullPriceCents: 10001,
        floorPriceCents: 0,
        steps: [{ leadMinutes: 60, discountPercent: 10 }],
        minutesUntilStart: 30,
      }),
      9001,
    );
  });
});
