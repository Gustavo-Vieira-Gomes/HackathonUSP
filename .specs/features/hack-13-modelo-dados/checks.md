# HACK-13 · Fatia 1 · checks

Profile: light
Plan: `.specs/features/hack-13-modelo-dados/plan.md`

14 checks em 2 fatias · 6 portas de uma via · 0 perguntas abertas

Perfil `light` pelo contrato dos maestros (padrão salvo pedido do maestro). Há colunas de dinheiro, mas a fatia não calcula nada: só tipo `Int` em centavos (C6) e o `CHECK` piso ≤ preço cheio (C7).

Convenções das provas:

- Teste de integração: um arquivo, `apps/api/src/prisma/domain-schema.test.ts`, suíte `node:test` existente; cada teste começa pelo id do check (`C4 - …`). Usa o `PrismaService` contra o Postgres do worktree, cria `User` com `role` pelo Prisma e apaga o que gravou no fim. Comando-base, de `apps/api`, com o banco no ar e as migrations aplicadas:
  `npx prisma generate && npx tsc -p tsconfig.json --outDir .test-dist && node --env-file-if-exists=.env --test --test-name-pattern="^C<n> " .test-dist/prisma/domain-schema.test.js`.
  As provas abaixo assumem `.test-dist` compilado pelo comando acima.
- SQL: `docker compose exec -T postgres psql -U hackathon -d hack_13 -tAc "<consulta>"`, abreviado abaixo como `PSQL "<consulta>"`, da raiz do worktree.
- Banco: só o Postgres local do worktree (`127.0.0.1:54313`, banco `hack_13`). O `DATABASE_URL` efetivo de `apps/api/.env` é lido antes de qualquer prova que abre conexão.

## Checks

### S1 - tabelas por migration, tipos e padrões · 3 arquivos · ~14 KB · ~4k

**C1** - Depois de `npm run db:migrate -w @hackathon/api`, o schema `public` de `hack_13` tem exatamente as 12 tabelas `Account`, `Clinic`, `ClinicOpeningHours`, `Exam`, `Patient`, `PriceStep`, `Session`, `Subscription`, `SubscriptionWindow`, `User`, `Verification` e `_prisma_migrations` (nenhuma da fatia 2), e `_prisma_migrations` tem exatamente 2 linhas aplicadas: `20261108025102_init_auth` e uma migration nova posterior a ela (S1, AC 1)
Proof: `PSQL "select string_agg(table_name, ',' order by table_name) from information_schema.tables where table_schema='public'" | grep -qx 'Account,Clinic,ClinicOpeningHours,Exam,Patient,PriceStep,Session,Subscription,SubscriptionWindow,User,Verification,_prisma_migrations'`
Proof: `PSQL "select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null" | grep -qx 2 && ls apps/api/prisma/migrations | grep -E '^[0-9]{14}_' | sort | head -1 | grep -qx 20261108025102_init_auth && test "$(ls -d apps/api/prisma/migrations/*/ | wc -l | tr -d ' ')" = 2`

**C2** - A `init_auth` fica byte a byte igual à de `origin/main`, e o `migration.sql` novo não tem `ALTER TABLE`, `DROP` nem `CREATE INDEX` sobre `User`, `Session`, `Account` ou `Verification` (só `REFERENCES "User"`) (S1, AC 2)
Proof: `git diff --quiet origin/main -- apps/api/prisma/migrations/20261108025102_init_auth`
Proof: `! grep -nE 'ALTER TABLE "(User|Session|Account|Verification)"|DROP |ON "(User|Session|Account|Verification)"' $(ls -d apps/api/prisma/migrations/*/ | sort | tail -1)migration.sql`

**C3** - Com o `schema.prisma` sem mudança, o banco migrado e o schema não têm diferença (`migrate diff` sai 0, os dois `CHECK` de `Exam` não aparecem como coisa a remover), `migrate status` diz que está em dia, e os 2 `CHECK` continuam em `Exam` depois disso (S1, AC 3; porta 5)
Proof: `cd apps/api && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
Proof: `cd apps/api && npx prisma migrate status`
Proof: `PSQL "select count(*) from pg_constraint where conrelid='\"Exam\"'::regclass and contype='c'" | grep -qx 2`

**C4** - `Clinic` criada sem informar `dailyDiscountCap`, `depositPercent`, `waveSize` e `waveWindowMinutes` volta do banco com `5`, `20`, `5` e `10` (S1, AC 4; porta 4)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C4 " .test-dist/prisma/domain-schema.test.js`

**C5** - A coluna `id` das 7 tabelas novas é `uuid` e tem default gerado; `Clinic.userId` e `Patient.userId` são `text` (porta 2)
Proof: `PSQL "select count(*) from information_schema.columns where table_schema='public' and column_name='id' and data_type='uuid' and table_name in ('Clinic','ClinicOpeningHours','Exam','PriceStep','Patient','Subscription','SubscriptionWindow')" | grep -qx 7`
Proof: `PSQL "select count(*) from information_schema.columns where column_name='userId' and data_type='text' and table_name in ('Clinic','Patient')" | grep -qx 2`
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C5 " .test-dist/prisma/domain-schema.test.js` (cria uma linha de cada um dos 7 modelos sem informar `id` e o `id` devolvido casa com o formato UUID)

**C6** - As colunas de unidade têm o tipo da porta 3: `fullPriceCents`, `floorPriceCents`, `maxPriceCents`, `depositPercent`, `discountPercent`, `minLeadMinutes`, `toleranceMinutes`, `maxTravelMinutes`, `waveWindowMinutes`, `waveSize`, `dailyDiscountCap`, `preparationHours`, `questionnaireVersion`, `weekday`, `startMinute` e `endMinute` são `integer` (cada uma existe em pelo menos uma tabela nova); latitude e longitude são `double precision`; todo `DateTime` das tabelas novas é `timestamp(3) without time zone`; `contraindications` é `text[]` (portas 3 e 4)
Proof: `PSQL "select count(distinct column_name) from information_schema.columns where table_schema='public' and data_type='integer' and column_name in ('fullPriceCents','floorPriceCents','maxPriceCents','depositPercent','discountPercent','minLeadMinutes','toleranceMinutes','maxTravelMinutes','waveWindowMinutes','waveSize','dailyDiscountCap','preparationHours','questionnaireVersion','weekday','startMinute','endMinute')" | grep -qx 16`
Proof: `PSQL "select count(*) from information_schema.columns where table_schema='public' and table_name in ('Clinic','ClinicOpeningHours','Exam','PriceStep','Patient','Subscription','SubscriptionWindow') and ((column_name ilike any (array['%Cents','%Percent','%Minutes','%Minute','weekday']) and data_type<>'integer') or (data_type like 'timestamp%' and (data_type<>'timestamp without time zone' or datetime_precision<>3)) or (column_name ilike any (array['lat%','lng%','lon%']) and data_type<>'double precision'))" | grep -qx 0`
Proof: `PSQL "select count(*) from information_schema.columns where table_schema='public' and table_name in ('Clinic','Patient','Subscription') and column_name ilike any (array['lat%','lng%','lon%']) and data_type='double precision'" | grep -qvx 0`
Proof: `PSQL "select data_type || ':' || udt_name from information_schema.columns where table_name='Exam' and column_name='contraindications'" | grep -qx 'ARRAY:_text'`

### S2 - perfis ligados à conta, unicidades e CHECK · 1 arquivo · ~10 KB · ~3k

**C7** - Exame com `floorPriceCents` maior que `fullPriceCents`, com `toleranceMinutes` 0 ou com `maxTravelMinutes` 0 é recusado pelo banco com SQLSTATE `23514` (o código do Postgres, onde o Prisma o expuser no erro) e a contagem de `Exam` da clínica não muda; nas bordas aceitas, `floorPriceCents` igual a `fullPriceCents` com `toleranceMinutes` 1 e `maxTravelMinutes` 1, o exame é gravado (S2, AC 5; porta 5; RN-02)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C7 " .test-dist/prisma/domain-schema.test.js` (tabela: 3 casos recusados + 1 aceito)

**C8** - Uma segunda `Clinic` com o mesmo `userId` é recusada com `P2002`, e uma segunda `Patient` com o mesmo `userId` também; a contagem de perfis daquele `userId` fica 1 (S2, AC 6; porta 1)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C8 " .test-dist/prisma/domain-schema.test.js` (2 casos)

**C9** - Apagar o `User` de uma clínica sem exames apaga a `Clinic` (contagem 0), e apagar o `User` de um paciente sem inscrições apaga o `Patient` (contagem 0) (S2, AC 7; porta 1)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C9 " .test-dist/prisma/domain-schema.test.js` (2 casos)

**C10** - Uma segunda `Clinic` com `cnes` já cadastrado é recusada com `P2002`; um segundo `Exam` com o mesmo `tussCode` na mesma clínica é recusado com `P2002`; o mesmo `tussCode` numa outra clínica é gravado (S2, AC 8; porta 6)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C10 " .test-dist/prisma/domain-schema.test.js` (3 casos)

**C11** - Uma segunda `Subscription` do mesmo paciente para o mesmo `tussCode` é recusada com `P2002`; o mesmo `tussCode` para outro paciente é gravado (S2, AC 9; porta 6; D4)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C11 " .test-dist/prisma/domain-schema.test.js` (2 casos)

**C12** - Regra de exclusão das 5 FKs internas do domínio: apagar uma `Clinic` com `Exam` é recusado e as duas linhas continuam; apagar um `Patient` com `Subscription` é recusado e as duas continuam; apagar uma `Clinic` sem exames apaga seus `ClinicOpeningHours` (contagem 0); apagar um `Exam` apaga seus `PriceStep` (contagem 0); apagar uma `Subscription` apaga suas `SubscriptionWindow` (contagem 0) (porta 1)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C12 " .test-dist/prisma/domain-schema.test.js` (5 casos)

**C13** - O teste de integração não deixa linha para trás: depois da suíte, nenhum `User` com o marcador de e-mail do arquivo e nenhuma linha nas 7 tabelas novas ligada a ele (porta 1)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C13 " .test-dist/prisma/domain-schema.test.js` (roda por último no arquivo, depois da limpeza, e conta 0 nas 7 tabelas para os ids criados)

**C14** - Lint, tipos, testes e formatação do repositório passam com a fatia (gate do repo)
Proof: `npm run check` (com o lock pesado)

## Coverage

| Set (size)                                        | Member -> proof                                                                                                                                                                                                                                  | Unproven |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| tabelas novas (7)                                 | `Clinic` C1 · `ClinicOpeningHours` C1 · `Exam` C1 · `PriceStep` C1 · `Patient` C1 · `Subscription` C1 · `SubscriptionWindow` C1                                                                                                                  | -        |
| tabelas de auth intocadas (4)                     | `User` C2 · `Session` C2 · `Account` C2 · `Verification` C2                                                                                                                                                                                      | -        |
| padrões de `Clinic` (4)                           | `dailyDiscountCap` C4 · `depositPercent` C4 · `waveSize` C4 · `waveWindowMinutes` C4                                                                                                                                                             | -        |
| `CHECK` de `Exam`, 3 recusas e 1 borda aceita (4) | piso > cheio C7 · `toleranceMinutes` 0 C7 · `maxTravelMinutes` 0 C7 · piso = cheio, 1 e 1 C7                                                                                                                                                     | -        |
| unicidades (5)                                    | `Clinic.userId` C8 · `Patient.userId` C8 · `Clinic.cnes` C10 · `Exam(clinicId, tussCode)` C10 · `Subscription(patientId, tussCode)` C11                                                                                                          | -        |
| regra de exclusão das FKs (7)                     | `User→Clinic` cascata C9 · `User→Patient` cascata C9 · `Clinic→Exam` restrict C12 · `Patient→Subscription` restrict C12 · `Clinic→ClinicOpeningHours` cascata C12 · `Exam→PriceStep` cascata C12 · `Subscription→SubscriptionWindow` cascata C12 | -        |
| portas de `Landing` (6)                           | porta 1 C8, C9, C12 · porta 2 C5 · porta 3 C6 · porta 4 C4, C6 · porta 5 C3, C7 · porta 6 C10, C11                                                                                                                                               | -        |
| entidades de `Relations` (7)                      | `Clinic` C4 · `ClinicOpeningHours` C12 · `Exam` C7 · `PriceStep` C12 · `Patient` C8 · `Subscription` C11 · `SubscriptionWindow` C12                                                                                                              | -        |
| execuções de `db:migrate` (2)                     | primeira, aplica a nova C1 · segunda, em dia C3                                                                                                                                                                                                  | -        |

- Nenhuma rota no `Surface` do plano: nenhuma linha de status.
- Nenhum check afirma mais que o caso que sua prova executa; os de tabela dizem o tamanho.

## Swept

- validação: C7, C6
- modos de falha: C7, C8, C10, C11, C12 - recusas do banco não gravam nada; migration falha dentro da transação do Postgres (existente no `migrate dev` do HACK-12)
- idempotência: C3, C11
- autorização: não se aplica - nenhuma rota nesta fatia; quem grava e com que papel é do HACK-16 e do HACK-23
- concorrência: C8, C10, C11 - unicidade no banco resolve dois cadastros simultâneos, não o serviço
- ciclo de vida do dado: C9, C12, C13
- falha de dependência externa: não se aplica - só o Postgres local; nenhuma chamada externa
- transições de estado: não se aplica - os estados de vaga e reserva são da fatia 2
- observabilidade: não se aplica - nenhum log nem métrica novo; schema e migration apenas

## Handoff

- S1 + S2 = `schema.prisma` (~2 KB → ~5 KB), migration nova (~6 KB), `domain-schema.test.ts` (~10 KB), leitura de `test-app.ts`/`prisma.service.ts` (~3 KB) ≈ 24 KB / 4 ≈ 6k, mais leitura do plano e dos checks (~25 KB, ~6k) ≈ 12k, abaixo do orçamento de 150k - um construtor
- Pré-requisito do build: o `node_modules` deste worktree está incompleto (sem `prisma` em `node_modules/.bin`); `npm ci` sob o lock pesado, sem dependência nova
