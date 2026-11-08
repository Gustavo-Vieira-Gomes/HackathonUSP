# HACK-32 continuação: checks

Profile: standard
Plan: `.specs/features/hack-32-cron-ondas/plan.md` (Assumption «Relógio da demo», ajustada nesta continuação)

Perfil `standard`: mexe em transição de estado (`occurredAt`, D6 do HACK-29) e em alerta a paciente (RN-36).

## Intent

Duas ressalvas do Revisor no merge do HACK-32 (PR #23, `48c63b0`), corrigidas a pedido do Gustavo em 08/11/2026.

1. **Recuo do relógio da demo.** Hoje a onda só sai quando `now ≥ last.occurredAt + Z` (`waves.service.ts:98-108`) e `nextOccurredAt` grava `max(now, last + 1 ms)` (`vacancies.service.ts:166-180`). Depois de `clock.advance` seguido de `clock.reset()`, a última transição fica no futuro e a vaga trava até o relógio real alcançá-la. Decisão técnica do Maestro Motor: (a) na janela Z, última `alertando` depois do agora conta como recuo e a janela está vencida; (b) em `nextOccurredAt`, se `last > now + 1 s` (recuo), grava `now`; senão continua `max(now, last + 1 ms)`, e a D6 vale dentro da mesma época. Sem (b), a onda nova herdaria `last + 1 ms` no futuro e o motor dispararia a cada tick, ignorando Z. As duas regras usam a mesma tolerância de 1 s (`last > now + 1 s`), para que «recuo» signifique a mesma coisa nos dois lugares.
   Consequência aceita: depois de um recuo, a linha do tempo da vaga ordena por relógio, e transições de antes do recuo podem aparecer depois das novas. Só acontece na demo.
2. **Cancelamento de pendentes.** `cancelPendingOfFinishedVacancies` (`notifications.service.ts:86-95`) trata `reservada` como fechada, mas a vaga reservada pode voltar por T9 (`publicada`) ou T11 (`alertando`). Passa a cancelar `Alert` pendente só em estado final: `realizada`, `expirada`, `cancelada`.

**Como as provas rodam.** Igual ao checks do HACK-32: em `apps/api`, banco `hack_32` em `127.0.0.1:54329` (`DATABASE_URL` conferido), depois de `npx prisma generate && npx tsc -p tsconfig.json --outDir .test-dist`. `RUN` = `node --env-file-if-exists=.env --test`; `MOT`, `SVC` e `NOT` como no checks do 32. Z = 10 min, N = 5.

## Checks

**K1** - Vaga `publicada` com `startsAt` = real + 3 dias e 12 inscrições compatíveis. `clock.advance(600)` e `tick(clock.now())` disparam a onda 1. `clock.reset()` e `tick(clock.now())` disparam a onda 2 (5 `enviar`, `Alert.wave = 2`), e a `Transition` dela tem `occurredAt` a ±1 s de `Date.now()`, não onda 1 + 1 ms. Um `tick` a +1 min do relógio novo não chama `enviar` nem grava `Transition`. Depois de `clock.advance(10)`, o `tick` dispara a onda 3 (`Alert.wave = 3`) (ressalva 1, (a) e (b))
Proof: `RUN --test-name-pattern="recuo do relógio dispara a próxima onda e respeita Z no relógio novo" MOT`

**K2** - Reescreve o C23 do HACK-32 («+1 ms quando o relógio recua»): depois de uma transição gravada com `clock.advance(60)`, `clock.reset()` e a transição seguinte da mesma vaga grava `occurredAt` a ±1 s de `Date.now()`, menor que a anterior. Com a última transição a `now + 500 ms` (dentro da tolerância), a seguinte grava última + 1 ms (ressalva 1, (b))
Proof: `RUN --test-name-pattern="HACK-32 C23 - depois do recuo do relógio occurredAt volta ao agora" SVC`

**K3** - C12 do HACK-29 inalterado: 5 transições em sequência sem espera, cada `occurredAt` estritamente maior que o anterior, mesmo no mesmo milissegundo (D6, porta 5)
Proof: `RUN --test-name-pattern="C12 - occurredAt estritamente crescente por vaga" SVC`

**K4** - Reescreve o C29 do HACK-32: vagas em `reservada`, `realizada`, `expirada`, `cancelada`, `publicada` e `alertando`, cada uma com 1 `Alert` `pendente`, 1 `enviado` e 1 `falhou`. `cancelPendingOfFinishedVacancies()` devolve 3; os `pendente` de `realizada`, `expirada` e `cancelada` viram `cancelado`; os de `reservada`, `publicada` e `alertando` continuam `pendente`; `enviado` e `falhou` de todas ficam como estavam (ressalva 2)
Proof: `RUN --test-name-pattern="HACK-32 C29 - cancela só pendentes de vaga em estado final" NOT`

**K5** - Reescreve o C30 do HACK-32: o mesmo cenário do K4 pelo `tick(now)` dá o mesmo resultado nos 18 `Alert` (ressalva 2)
Proof: `RUN --test-name-pattern="C30 - tick cancela pendentes de vaga em estado final" MOT`

**K6** - Plano e checks do 32 refletem a mudança: a Assumption «Relógio da demo» descreve o recuo e a consequência na linha do tempo; C23, C29, C30 e o AC 21 do plano (com seu teste independente) ficam marcados «mudado na continuação, 08/11, decisão do Gustavo via maestro»
Proof: `grep -c "mudado na continuação, 08/11" .specs/features/hack-32-cron-ondas/checks.md .specs/features/hack-32-cron-ondas/plan.md`

**K7** - Portões: `npm run check` e `npm run build` em 0 na raiz do worktree; suítes completas de `MOT`, `SVC` e `NOT` verdes (com log em arquivo)
Proof: `npm run check > check.log 2>&1 && npm run build > build.log 2>&1`

## Handoff

7 checks · 2 arquivos de produção (`waves.service.ts`, `vacancies.service.ts`) + 1 (`notifications.service.ts`) · 3 arquivos de teste · 2 docs. Cabe num construtor, sem lotes.
