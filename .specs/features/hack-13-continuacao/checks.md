# HACK-13 · continuação · checks

Profile: light
Base: `origin/main` em `b1bc276` (a fatia 2 entrou por squash em `b0680a2`, PR #8)

## Intent

Fechar três achados da revisão da PR #8, decididos pelo maestro (Settled pelo maestro, 08/11, revisão), numa migration nova por cima das que estão em `main`, sem editar `20261108034237_hack_13_horario_vaga_reserva_alerta_transicao`:

1. **Média.** Nada amarrava `Reservation.slotId` ao horário da vaga: um encaixe confirmado da vaga V (horário S1) gravado com `slotId = S2` escapava de `Reservation_active_slot_key`, e S1 aceitava uma comum confirmada ao lado, furando a RN-41. Correção: `Vacancy @@unique([id, slotId])` e FK composta `Reservation(vacancyId, slotId) → Vacancy(id, slotId)`, `MATCH SIMPLE` (a comum, com `vacancyId` nulo, não é checada), `ON DELETE RESTRICT`. Substitui `Reservation_vacancyId_fkey`.
2. **Baixa.** `Slot.examId` não amarrava `exam.clinicId = slot.clinicId`. Correção: `Exam @@unique([id, clinicId])` e FK composta `Slot(examId, clinicId) → Exam(id, clinicId)`, `RESTRICT`. Substitui `Slot_examId_fkey`.
3. **Baixa.** `Alert` não tinha `updatedAt`, embora `result` mude. Correção: `updatedAt @updatedAt`; a migration cria a coluna com `DEFAULT CURRENT_TIMESTAMP` (preenche linhas existentes) e tira o default em seguida, porque `@updatedAt` não tem default no banco e o `migrate diff` acusaria drift.

Fora: alerta único por vaga + inscrição + canal fica como está; ressalvas do HACK-27/29 vão para o handoff do maestro.

Convenções: testes em `apps/api/src/prisma/booking-schema.test.ts` (suíte da fatia 2), cada um começa pelo id do check. Comando-base, de `apps/api`, com o Postgres do worktree no ar (`127.0.0.1:54313/hack_13`, conferido no `DATABASE_URL` de `apps/api/.env`) e as migrations aplicadas: `npx prisma generate && npx tsc -p tsconfig.json --outDir .test-dist && node --env-file-if-exists=.env --test --test-name-pattern="^C<n> " .test-dist/prisma/booking-schema.test.js`. `PSQL` = `docker compose exec -T postgres psql -U hackathon -d hack_13 -tAc`, da raiz do worktree.

## Checks

**C24** - Encaixe confirmado da vaga V (horário S1) gravado com `slotId = S2` é recusado com `P2003`/`23503` em `Reservation_vacancyId_slotId_fkey`; mover depois um encaixe de V de S1 para S2 também é recusado; S2 fica sem reserva; a comum confirmada em S1 entra e S1 tem exatamente uma reserva ativa (achado 1)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C24 " .test-dist/prisma/booking-schema.test.js`

**C25** - Encaixe com o `slotId` da própria vaga é aceito e confirmado; reserva comum com `vacancyId` nulo é aceita em outro horário (MATCH SIMPLE) (achado 1)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C25 " .test-dist/prisma/booking-schema.test.js`

**C26** - Horário com exame de outra clínica é recusado com `P2003`/`23503` em `Slot_examId_clinicId_fkey`, na criação e ao trocar `clinicId` de um horário existente; com exame da própria clínica é aceito (achado 2)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C26 " .test-dist/prisma/booking-schema.test.js`

**C27** - `Alert.updatedAt` é `timestamp(3) NOT NULL` sem default no banco, vem preenchido na criação e avança quando `result` muda; a migration cria a coluna com `DEFAULT CURRENT_TIMESTAMP` antes de tirar o default (achado 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C27 " .test-dist/prisma/booking-schema.test.js`
Proof: `PSQL "select data_type||'/'||datetime_precision||'/'||is_nullable||'/'||coalesce(column_default,'-') from information_schema.columns where table_name='Alert' and column_name='updatedAt'" | grep -qx 'timestamp without time zone/3/NO/-'`
Proof: `grep -n 'ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP' apps/api/prisma/migrations/20261108120000_*/migration.sql && grep -n 'ALTER COLUMN "updatedAt" DROP DEFAULT' apps/api/prisma/migrations/20261108120000_*/migration.sql`

**C28** - O C21 da fatia 2 acompanha os nomes novos: as 9 FKs isoláveis recusam apagar o pai com `P2003`/`23503` pelo nome (`Slot_examId_clinicId_fkey` e `Reservation_vacancyId_slotId_fkey` no lugar das antigas); `Slot_clinicId_fkey` é provada pelo catálogo (`confdeltype = 'r'`) e a exclusão da clínica segue recusada com os dois registros mantidos. Motivo: com a FK composta, todo horário aponta exame da própria clínica e apagar a clínica esbarra antes em `Exam_clinicId_fkey` (oid menor), então a recusa por nome deixou de ser isolável
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C21 " .test-dist/prisma/booking-schema.test.js`

**C29** - Migrations: as 3 de `main` ficam byte a byte iguais; a nova é a quarta e aplica do zero num banco descartável; depois disso `migrate diff` sai 0 e `migrate dev` diz `Already in sync`; o banco descartável é apagado
Proof: `git diff --quiet origin/main -- apps/api/prisma/migrations/20261108025102_init_auth apps/api/prisma/migrations/20261108032558_hack_13_clinica_exame_paciente_inscricao apps/api/prisma/migrations/20261108034237_hack_13_horario_vaga_reserva_alerta_transicao`
Proof: banco `hack_13_cont_scratch` criado, `DATABASE_URL=<…>/hack_13_cont_scratch npx prisma migrate deploy` (4 aplicadas), `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` em 0, `npx prisma migrate dev` com `Already in sync`, `DROP DATABASE`

**C30** - A suíte inteira da API (`npm test -w @hackathon/api`), `npm run check` e `npm run build` passam
Proof: `npm test -w @hackathon/api > log 2>&1` sem `fail`; `npm run check`; `npm run build` (sob o lock pesado)

## Mutação

Sem as duas FKs compostas (trocadas pelas FKs simples antigas no `hack_13` local), C24 e C26 falham (2/2); com elas de volta, `migrate diff` em 0.
