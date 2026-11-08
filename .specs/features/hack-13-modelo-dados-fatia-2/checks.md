# HACK-13 · Fatia 2 · checks

Profile: light
Plan: `.specs/features/hack-13-modelo-dados-fatia-2/plan.md`

23 checks em 4 fatias · 9 portas de uma via · 0 perguntas abertas

Perfil `light` pelo contrato dos maestros (padrão salvo pedido do maestro). Há colunas de dinheiro, mas a fatia não calcula nada: só tipo `Int` em centavos (C6) e as faixas `>= 0` (C19).

Convenções das provas:

- Teste de integração novo: `apps/api/src/prisma/booking-schema.test.ts`, suíte `node:test` existente; cada teste começa pelo id do check (`C7 - …`). Usa o `PrismaService` contra o Postgres do worktree, cria `User`, `Clinic`, `Exam`, `Patient` e `Subscription` pelo Prisma como base e apaga o que gravou no fim. Comando-base, de `apps/api`, com o banco no ar e as migrations aplicadas:
  `npx prisma generate && npx tsc -p tsconfig.json --outDir .test-dist && node --env-file-if-exists=.env --test --test-name-pattern="^C<n> " .test-dist/prisma/booking-schema.test.js`. As provas assumem `.test-dist` compilado.
- O arquivo da fatia 1, `apps/api/src/prisma/domain-schema.test.ts`, só ganha asserção: o `C12` dele passa a conferir o código das duas recusas `Restrict` (C21). Nada dele é apagado nem afrouxado.
- SQL: `docker compose exec -T postgres psql -U hackathon -d hack_13 -tAc "<consulta>"`, abreviado como `PSQL "<consulta>"`, da raiz do worktree.
- Código de erro: o helper `errorCodes` da fatia 1 (código do Prisma ou SQLSTATE do Postgres, onde o erro o carregar). Conferido no banco do worktree em 08/11: uma exclusão bloqueada por `ON DELETE RESTRICT` chega como `P2003` com `originalCode` `23503`; o Postgres 17 não devolve `23001`.
- Banco: só o Postgres local do worktree (`127.0.0.1:54313`, banco `hack_13`), conferido no `DATABASE_URL` de `apps/api/.env` antes de cada prova que abre conexão.

## Checks

### S1 - tabelas, enums e migration · 3 arquivos · ~30 KB · ~8k

**C1** - Depois de `npm run db:migrate -w @hackathon/api`, o schema `public` tem exatamente as 17 tabelas `Account`, `Alert`, `Clinic`, `ClinicOpeningHours`, `Exam`, `Patient`, `PriceStep`, `Reservation`, `Session`, `Slot`, `Subscription`, `SubscriptionWindow`, `Transition`, `User`, `Vacancy`, `Verification` e `_prisma_migrations`; `_prisma_migrations` tem 3 linhas aplicadas e há 3 pastas de migration, a nova depois de `20261108032558_hack_13_clinica_exame_paciente_inscricao` (S1, AC 1)
Proof: `PSQL "select string_agg(table_name, ',' order by table_name) from information_schema.tables where table_schema='public'" | grep -qx 'Account,Alert,Clinic,ClinicOpeningHours,Exam,Patient,PriceStep,Reservation,Session,Slot,Subscription,SubscriptionWindow,Transition,User,Vacancy,Verification,_prisma_migrations'`
Proof: `PSQL "select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null" | grep -qx 3 && test "$(ls -d apps/api/prisma/migrations/*/ | wc -l | tr -d ' ')" = 3 && ls -d apps/api/prisma/migrations/*/ | sort | sed -n 2p | grep -q 20261108032558_hack_13`

**C2** - As duas migrations de `main` ficam byte a byte iguais; o `migration.sql` novo não tem `ALTER TABLE`, `DROP` nem `CREATE INDEX` sobre `User`, `Session`, `Account` ou `Verification`, e sobre as 7 tabelas da fatia 1 só tem `ADD CONSTRAINT … CHECK`, `DROP INDEX "PriceStep_examId_idx"` e `CREATE UNIQUE INDEX "PriceStep_examId_leadMinutes_key"` (S1, AC 2; portas 8 e 9)
Proof: `git diff --quiet origin/main -- apps/api/prisma/migrations/20261108025102_init_auth apps/api/prisma/migrations/20261108032558_hack_13_clinica_exame_paciente_inscricao`
Proof: `! grep -nE 'ALTER TABLE "(User|Session|Account|Verification)"|ON "(User|Session|Account|Verification)"' $(ls -d apps/api/prisma/migrations/*/ | sort | tail -1)migration.sql`
Proof: `! grep -nE '(ALTER TABLE|DROP|INDEX)[^;]*"(Clinic|ClinicOpeningHours|Exam|PriceStep|Patient|Subscription|SubscriptionWindow)"' $(ls -d apps/api/prisma/migrations/*/ | sort | tail -1)migration.sql | grep -vE 'ADD CONSTRAINT "[A-Za-z_]+" CHECK|DROP INDEX "PriceStep_examId_idx"|CREATE UNIQUE INDEX "PriceStep_examId_leadMinutes_key"|REFERENCES "(Clinic|Exam|Patient|Subscription)"\("id"\)|^[0-9]+:--'`

**C3** - Os 9 tipos enum existem com exatamente estes valores, nesta ordem: `AlertChannel` push,email,whatsapp · `AlertResult` pendente,enviado,falhou,cancelado · `PaymentMethod` pix,cartao,no_local · `ReservationState` aguardando_pagamento,confirmada,realizada,no_show,cancelada,expirada · `ReservationType` comum,encaixe,no_show · `SlotOrigin` agenda,manual · `TransitionOrigin` agenda,clinica,paciente,motor · `VacancyOrigin` cancelamento,no_show,vazio · `VacancyState` publicada,alertando,reservada,realizada,expirada,cancelada (S1, AC 3; porta 1)
Proof: `PSQL "select string_agg(t.typname || ':' || v.vals, ';' order by t.typname) from pg_type t join lateral (select string_agg(enumlabel, ',' order by enumsortorder) vals from pg_enum where enumtypid=t.oid) v on true where t.typtype='e'" | grep -qx 'AlertChannel:push,email,whatsapp;AlertResult:pendente,enviado,falhou,cancelado;PaymentMethod:pix,cartao,no_local;ReservationState:aguardando_pagamento,confirmada,realizada,no_show,cancelada,expirada;ReservationType:comum,encaixe,no_show;SlotOrigin:agenda,manual;TransitionOrigin:agenda,clinica,paciente,motor;VacancyOrigin:cancelamento,no_show,vazio;VacancyState:publicada,alertando,reservada,realizada,expirada,cancelada'`

**C4** - Um `UPDATE` cru que grava `'ativa'` em `Vacancy.state` e outro que grava `'paga'` em `Reservation.state` são recusados com SQLSTATE `22P02`, e as duas linhas continuam `publicada` e `aguardando_pagamento` (S1, AC 4; porta 1)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C4 " .test-dist/prisma/booking-schema.test.js` (2 casos)

**C5** - Com o `schema.prisma` sem mudança, `migrate diff` entre o banco e o schema sai 0 e `migrate status` diz que está em dia; depois disso o banco tem os 3 índices parciais com `WHERE` (`Reservation_active_vacancy_key`, `Reservation_active_slot_key`, `Vacancy_active_slot_key`) e a contagem de `CHECK` por tabela é a das portas 5 e 8 (S1, AC 5; portas 4, 5 e 8)
Proof: `cd apps/api && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
Proof: `cd apps/api && npx prisma migrate status`
Proof: `PSQL "select count(*) from pg_indexes where indexname in ('Reservation_active_vacancy_key','Reservation_active_slot_key','Vacancy_active_slot_key') and indexdef like 'CREATE UNIQUE INDEX%WHERE%'" | grep -qx 3`
Proof: `grep -q 'previewFeatures *= *\["partialIndexes"\]' apps/api/prisma/schema.prisma`

**C6** - Nas 5 tabelas novas, `id` é `uuid` com default gerado pelo Prisma client; `currentPriceCents`, `chargedPriceCents`, `depositCents` e `wave` são `integer`; todo `DateTime` é `timestamp(3) without time zone`; `Vacancy.state` e `Reservation.state` são do tipo enum `VacancyState` e `ReservationState`; `Transition.fromState` e `toState` são `text` (portas 1, 2 e 7)
Proof: `PSQL "select count(*) from information_schema.columns where table_schema='public' and column_name='id' and data_type='uuid' and table_name in ('Slot','Vacancy','Reservation','Alert','Transition')" | grep -qx 5`
Proof: `PSQL "select count(*) from information_schema.columns where table_schema='public' and table_name in ('Slot','Vacancy','Reservation','Alert','Transition') and ((column_name in ('currentPriceCents','chargedPriceCents','depositCents','wave') and data_type<>'integer') or (data_type like 'timestamp%' and (data_type<>'timestamp without time zone' or datetime_precision<>3)) or (column_name in ('fromState','toState') and data_type<>'text'))" | grep -qx 0`
Proof: `PSQL "select string_agg(table_name || '.' || udt_name, ',' order by table_name) from information_schema.columns where column_name='state' and table_name in ('Vacancy','Reservation')" | grep -qx 'Reservation.ReservationState,Vacancy.VacancyState'`
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C6 " .test-dist/prisma/booking-schema.test.js` (cria uma linha de cada um dos 5 modelos sem informar `id`; o `id` casa com o formato UUID)

### S2 - a trava da vaga e do horário · 1 arquivo · ~10 KB · ~3k

**C7** - Com uma reserva da vaga V já `confirmada`, e noutro caso já `realizada`, o `UPDATE` que confirma uma segunda reserva de V é recusado com `P2002` e ela continua `aguardando_pagamento` (S2, AC 6; porta 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C7 " .test-dist/prisma/booking-schema.test.js` (2 casos: `confirmada`, `realizada`)

**C8** - Em 5 rodadas, duas reservas `aguardando_pagamento` da mesma vaga são confirmadas em paralelo (`Promise.allSettled`, duas conexões); em cada rodada exatamente uma termina `confirmada` e a outra rejeita com `P2002` (S2, AC 7; porta 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C8 " .test-dist/prisma/booking-schema.test.js`

**C9** - A mesma vaga aceita 2 reservas em cada um dos estados `aguardando_pagamento`, `expirada`, `cancelada` e `no_show` (8 linhas), ao lado de uma `confirmada` (S2, AC 8; porta 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C9 " .test-dist/prisma/booking-schema.test.js`

**C10** - Depois que a reserva `confirmada` de V passa a `cancelada`, confirmar outra reserva de V é aceito (S2, AC 9; porta 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C10 " .test-dist/prisma/booking-schema.test.js`

**C11** - Com uma reserva comum `confirmada` no horário H, e noutro caso uma `realizada`, confirmar uma reserva de encaixe de uma vaga de H é recusado com `P2002` (S2, AC 10; portas 2 e 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C11 " .test-dist/prisma/booking-schema.test.js` (2 casos)

**C12** - Com uma vaga do horário H em `publicada`, em `alertando` e em `reservada` (3 casos), criar uma segunda vaga `publicada` em H é recusado com `P2002`; com a vaga anterior em `cancelada`, `expirada` ou `realizada` (3 casos), a segunda é gravada (S2, AC 11; porta 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C12 " .test-dist/prisma/booking-schema.test.js` (tabela: 3 recusas + 3 aceites)

### S3 - forma de reserva, transição, horário e alerta · 1 arquivo · ~6 KB · ~2k

**C13** - Reserva `comum` com `vacancyId`, `encaixe` sem `vacancyId` e `no_show` sem `vacancyId` são recusadas com `23514`; `comum` sem vaga e `encaixe` com vaga são gravadas (S3, AC 12; porta 5)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C13 " .test-dist/prisma/booking-schema.test.js` (tabela: 3 recusas + 2 aceites)

**C14** - Reserva `encaixe` e reserva `no_show` com `paymentMethod = no_local` são recusadas com `23514`; `comum` com `no_local` é gravada (S3, AC 13; porta 5; RN-39)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C14 " .test-dist/prisma/booking-schema.test.js` (2 recusas + 1 aceite)

**C15** - `Transition` sem alvo e com os dois alvos é recusada com `23514`; só com `vacancyId` e só com `reservationId` é gravada, com `fromState` nulo aceito (S3, AC 14; portas 5 e 7)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C15 " .test-dist/prisma/booking-schema.test.js` (2 recusas + 2 aceites)

**C16** - `Slot` com `endsAt` igual a `startsAt` e com `endsAt` um minuto antes é recusado com `23514`; com `endsAt` um minuto depois é gravado (S3, AC 15; porta 5)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C16 " .test-dist/prisma/booking-schema.test.js` (2 recusas + 1 aceite)

**C17** - Um segundo `Alert` com a mesma vaga, inscrição e canal é recusado com `P2002`; o mesmo par vaga e inscrição em outro canal é gravado (S3, AC 16; porta 6)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C17 " .test-dist/prisma/booking-schema.test.js`

### S4 - faixas, degrau único e exclusão restrita · 2 arquivos · ~25 KB · ~6k

**C18** - Nas tabelas da fatia 1, cada valor da coluna `Refused` abaixo é recusado com `23514` e a contagem não muda; cada valor da coluna `Accepted` é gravado (S4, AC 17; porta 8). Tabela, 23 recusas e 19 bordas aceitas:
`Clinic.dailyDiscountCap` -1 | 0 · `Clinic.depositPercent` -1, 101 | 0, 100 · `Clinic.waveSize` 0 | 1 · `Clinic.waveWindowMinutes` 0 | 1 · `ClinicOpeningHours.weekday` -1, 7 | 0, 6 · `ClinicOpeningHours` start -1; start = end; end 1441 | 0–1440 · `Exam.fullPriceCents` -1 (piso -1) | 0 (piso 0) · `Exam.floorPriceCents` -1 | 0 · `Exam.minLeadMinutes` -1 | 0 · `Exam.preparationHours` -1 | 0 · `PriceStep.leadMinutes` -1 | 0 · `PriceStep.discountPercent` -1, 101 | 0, 100 · `Subscription.maxPriceCents` -1 | 0 · `SubscriptionWindow.weekday` -1, 7 | 0, 6 · `SubscriptionWindow` start -1; start = end; end 1441 | 0–1440
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C18 " .test-dist/prisma/booking-schema.test.js` (tabela-driven sobre as 42 linhas, 15 colunas)

**C19** - `Vacancy.currentPriceCents` -1, `Reservation.chargedPriceCents` -1, `Reservation.depositCents` -1 e `Alert.wave` 0 são recusados com `23514`; 0, 0, 0 e 1 são gravados (S4, AC 18; porta 8)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C19 " .test-dist/prisma/booking-schema.test.js` (4 recusas + 4 aceites)

**C20** - Um segundo `PriceStep` do mesmo exame com a mesma `leadMinutes` é recusado com `P2002`; a mesma `leadMinutes` em outro exame é gravada (S4, AC 19; porta 9)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C20 " .test-dist/prisma/booking-schema.test.js`

**C21** - Apagar a linha pai de cada uma das 12 FKs `Restrict` abaixo, com um filho existente, é recusado com `P2003` (e `originalCode` `23503` onde o erro o carregar), e pai e filho continuam lá (S4, AC 20). Fatia 1: `Clinic→Exam`, `Patient→Subscription`. Fatia 2: `Clinic→Slot`, `Exam→Slot`, `Slot→Vacancy`, `Slot→Reservation`, `Vacancy→Reservation`, `Patient→Reservation`, `Vacancy→Alert`, `Subscription→Alert`, `Vacancy→Transition`, `Reservation→Transition`
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C12 " .test-dist/prisma/domain-schema.test.js` (os 2 da fatia 1, com o código conferido)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C21 " .test-dist/prisma/booking-schema.test.js` (tabela: os 10 da fatia 2)
Proof: `PSQL "select count(*) from pg_constraint where contype='f' and confdeltype='r' and conrelid::regclass::text in ('\"Slot\"','\"Vacancy\"','\"Reservation\"','\"Alert\"','\"Transition\"')" | grep -qx 10`

**C22** - A suíte nova apaga tudo o que gravou: depois da limpeza, as 12 tabelas de domínio e `User` contam 0 para os ids criados por ela (S1-S4; ciclo de vida)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C22 " .test-dist/prisma/booking-schema.test.js` (roda por último no arquivo)

**C23** - Lint, tipos, testes (as duas suítes do Prisma juntas) e formatação do repositório passam com a fatia (gate do repo)
Proof: `npm run check` (com o lock pesado)

## Coverage

| Set (size)                                                         | Member -> proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Unproven |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| tabelas novas (5)                                                  | `Slot` C1 · `Vacancy` C1 · `Reservation` C1 · `Alert` C1 · `Transition` C1                                                                                                                                                                                                                                                                                                                                                                                                             | -        |
| tabelas que a migration nova só pode tocar pelas portas 8 e 9 (11) | `User` C2 · `Session` C2 · `Account` C2 · `Verification` C2 · `Clinic` C2 · `ClinicOpeningHours` C2 · `Exam` C2 · `PriceStep` C2 · `Patient` C2 · `Subscription` C2 · `SubscriptionWindow` C2                                                                                                                                                                                                                                                                                          | -        |
| enums (9)                                                          | `AlertChannel` C3 · `AlertResult` C3 · `PaymentMethod` C3 · `ReservationState` C3 · `ReservationType` C3 · `SlotOrigin` C3 · `TransitionOrigin` C3 · `VacancyOrigin` C3 · `VacancyState` C3                                                                                                                                                                                                                                                                                            | -        |
| colunas de estado com valor inválido (2)                           | `Vacancy.state` C4 · `Reservation.state` C4                                                                                                                                                                                                                                                                                                                                                                                                                                            | -        |
| índices parciais (3)                                               | `Reservation_active_vacancy_key` C5, C7, C8 · `Reservation_active_slot_key` C5, C11 · `Vacancy_active_slot_key` C5, C12                                                                                                                                                                                                                                                                                                                                                                | -        |
| estados da reserva diante da trava (6)                             | `confirmada` C7 · `realizada` C7, C11 · `aguardando_pagamento` C9 · `expirada` C9 · `cancelada` C9, C10 · `no_show` C9                                                                                                                                                                                                                                                                                                                                                                 | -        |
| estados da vaga diante da unicidade por horário (6)                | `publicada` C12 · `alertando` C12 · `reservada` C12 · `cancelada` C12 · `expirada` C12 · `realizada` C12                                                                                                                                                                                                                                                                                                                                                                               | -        |
| `CHECK` da porta 5 (4)                                             | tipo × vaga C13 · `no_local` só em `comum` C14 · um alvo por transição C15 · fim > início C16                                                                                                                                                                                                                                                                                                                                                                                          | -        |
| faixas da fatia 1 por coluna, porta 8, 42 linhas de teste (15)     | `Clinic.dailyDiscountCap` C18 · `Clinic.depositPercent` C18 · `Clinic.waveSize` C18 · `Clinic.waveWindowMinutes` C18 · `ClinicOpeningHours.weekday` C18 · `ClinicOpeningHours` minutos C18 · `Exam.fullPriceCents` C18 · `Exam.floorPriceCents` C18 · `Exam.minLeadMinutes` C18 · `Exam.preparationHours` C18 · `PriceStep.leadMinutes` C18 · `PriceStep.discountPercent` C18 · `Subscription.maxPriceCents` C18 · `SubscriptionWindow.weekday` C18 · `SubscriptionWindow` minutos C18 | -        |
| faixas das colunas novas, porta 8 (4)                              | `currentPriceCents` C19 · `chargedPriceCents` C19 · `depositCents` C19 · `wave` C19                                                                                                                                                                                                                                                                                                                                                                                                    | -        |
| unicidades novas (5)                                               | trava por vaga C7 · trava por horário C11 · vaga ativa por horário C12 · `Alert(vacancyId, subscriptionId, channel)` C17 · `PriceStep(examId, leadMinutes)` C20                                                                                                                                                                                                                                                                                                                        | -        |
| FKs `Restrict` (12)                                                | `Clinic→Exam` C21 · `Patient→Subscription` C21 · `Clinic→Slot` C21 · `Exam→Slot` C21 · `Slot→Vacancy` C21 · `Slot→Reservation` C21 · `Vacancy→Reservation` C21 · `Patient→Reservation` C21 · `Vacancy→Alert` C21 · `Subscription→Alert` C21 · `Vacancy→Transition` C21 · `Reservation→Transition` C21                                                                                                                                                                                  | -        |
| portas de `Landing` (9)                                            | porta 1 C3, C4 · porta 2 C6, C11 · porta 3 C7, C8, C11, C12 · porta 4 C5 · porta 5 C5, C13, C14, C15, C16 · porta 6 C17 · porta 7 C6, C15 · porta 8 C18, C19 · porta 9 C2, C20                                                                                                                                                                                                                                                                                                         | -        |
| entidades de `Relations` (5)                                       | `Slot` C16 · `Vacancy` C12 · `Reservation` C7 · `Alert` C17 · `Transition` C15                                                                                                                                                                                                                                                                                                                                                                                                         | -        |
| execuções de `db:migrate` (2)                                      | primeira, aplica a nova C1 · segunda, em dia C5                                                                                                                                                                                                                                                                                                                                                                                                                                        | -        |

- Nenhuma rota no `Surface` do plano: nenhuma linha de status.
- Nenhum check afirma mais que o caso que sua prova executa; os de tabela dizem o tamanho.

## Swept

- validação: C3, C4, C13, C14, C15, C16, C18, C19
- modos de falha: C4, C7, C13 a C21 - recusas do banco não gravam nada; migration falha dentro da transação do Postgres (existente no `migrate dev` do HACK-12)
- idempotência: C5, C17, C20
- autorização: não se aplica - nenhuma rota nesta fatia; quem grava e com que papel é do HACK-20, 25 e 27
- concorrência: C8 - duas confirmações simultâneas, exatamente uma vence pelo índice parcial
- ciclo de vida do dado: C10, C12, C21, C22
- falha de dependência externa: não se aplica - só o Postgres local; nenhuma chamada externa
- transições de estado: C7, C9, C10, C12 - o banco só guarda o alfabeto e as unicidades; a ordem das transições (RN-24) é do HACK-29
- observabilidade: não se aplica - nenhum log nem métrica novo; o modelo `Transition` é o registro, gravado pelo HACK-29

## Handoff

- S1-S4 = `schema.prisma` (~8 KB → ~14 KB), migration nova (~10 KB), `booking-schema.test.ts` novo (~25 KB), `domain-schema.test.ts` (~15 KB, só o C12), leitura de `prisma.service.ts`/`env.ts` (~3 KB) ≈ 67 KB / 4 ≈ 17k, mais plano e checks (~55 KB, ~14k) ≈ 31k, abaixo do orçamento de 150k - um construtor
- Pré-requisito: Postgres do worktree no ar (54313, `hack_13`) e `node_modules` presente; nenhuma dependência nova
- Mecanismo: um construtor (abaixo do orçamento)
- **Boundary:** C1-C23 fechados em `3489f77`
- **Settled mid-build:** o predicado dos 3 índices parciais (porta 3) está escrito na forma que o Postgres guarda, `state = ANY (ARRAY['confirmada'::"ReservationState", …])`, e não `"state" IN (…)`: com `IN`, o `migrate diff` seguinte via drift e gerava `DROP INDEX` + `CREATE UNIQUE INDEX` (o risco da porta 4); a semântica é a mesma. Fixtures da fatia 1 extraídas para `apps/api/src/testing/schema-fixtures.ts` (segundo consumidor).
- **Abandoned:** `prisma migrate dev --create-only` (recusa ambiente não interativo); a migration nasceu de `migrate diff --from-config-datasource --to-schema --script`, completada à mão e aplicada com `migrate deploy` no banco local. `migrate reset` pede consentimento do usuário e não foi usado: depois de corrigir o predicado na própria migration (ainda não mergeada), o checksum local foi alinhado em `_prisma_migrations` e a aplicação do zero foi provada num banco descartável (`hack_13_f2_scratch`, criado e apagado), com `migrate diff` em 0.
