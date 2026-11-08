import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VacancyState } from '../../generated/prisma/client';
import { canTransition } from './vacancy-transitions';

/**
 * Prova a tabela de transições da vaga na própria camada (C3 do checks.md do HACK-29).
 * A lista esperada é a «Tabela de transições» do plano, escrita aqui à mão: o teste
 * não lê a tabela do código.
 */
const ACCEPTED: ReadonlyArray<readonly [VacancyState, VacancyState]> = [
  ['publicada', 'alertando'], // T2
  ['alertando', 'alertando'], // T3
  ['alertando', 'publicada'], // T4
  ['publicada', 'reservada'], // T5
  ['alertando', 'reservada'], // T6
  ['reservada', 'realizada'], // T7
  ['publicada', 'expirada'], // T8
  ['alertando', 'expirada'], // T8
  ['reservada', 'publicada'], // T9
  ['reservada', 'cancelada'], // T10
  ['reservada', 'alertando'], // T11
  ['publicada', 'cancelada'], // T12
  ['alertando', 'cancelada'], // T12
];

test('C3 - tabela aceita exatamente 13 dos 36 pares', () => {
  const states = Object.values(VacancyState);
  assert.equal(states.length, 6);
  const accepted = new Set(ACCEPTED.map(([from, to]) => `${from}>${to}`));
  assert.equal(accepted.size, 13);
  let yes = 0;
  let no = 0;
  for (const from of states) {
    for (const to of states) {
      const expected = accepted.has(`${from}>${to}`);
      assert.equal(canTransition(from, to), expected, `${from} → ${to}`);
      if (expected) yes += 1;
      else no += 1;
    }
  }
  assert.equal(yes, 13);
  assert.equal(no, 23);
});
