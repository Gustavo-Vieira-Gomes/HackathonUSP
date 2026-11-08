# HACK-29 checks

Profile: standard
Plan: `.specs/features/hack-29-maquina-estados/plan.md`

Perfil `standard` e não `light`: o card não mexe em dinheiro, mas é uma tabela de decisão (36 pares), tem corrida entre reserva e expiração e é o portão da cobrança (`publicada → realizada` gera cobrança sem reserva, RN-45/46). Na dúvida entre dois perfis, o mais alto.

23 checks em 5 fatias · 6 portas de uma via · 1 pergunta aberta, que bloqueia o build (PR da fatia 2 do HACK-13 em `main`)

**Como as provas rodam.** Em `apps/api`, com o Postgres do worktree no ar (`127.0.0.1:54329`, banco `hack_29`, `DATABASE_URL` do `.env` da API lido antes, nunca banco compartilhado), e depois de `npx prisma generate && npx tsc -p tsconfig.json --outDir .test-dist` (o mesmo passo do `npm run test`). O `node --test` só filtra com `--test-name-pattern` **antes** do arquivo (opção depois do arquivo é ignorada; conferido no Node 26.8.2). Abreviações abaixo: `SVC` = `.test-dist/modules/vacancies/vacancies.service.test.js`; `TAB` = `.test-dist/modules/vacancies/vacancy-transitions.test.js`; `RUN` = `node --env-file-if-exists=.env --test`.

## Checks

### S1 - tabela e recusa · 6 arquivos · ~30 KB · ~8k

**C1** - `transition(id, 'realizada', …)` numa vaga `publicada` lança `ConflictException` com `getStatus() = 409` e mensagem `Transição de vaga inválida: publicada → realizada` (S1, AC 1; porta 6)
Proof: `RUN --test-name-pattern="publicada para realizada recusa com 409" SVC`

**C2** - Depois da recusa do C1, `Vacancy.state` continua `publicada` e o número de `Transition` da vaga é o mesmo de antes da chamada (S1, AC 2)
Proof: `RUN --test-name-pattern="recusa não muda estado nem grava transição" SVC`

**C3** - `canTransition(from, to)` devolve `true` para exatamente 13 dos 36 pares de `VacancyState` × `VacancyState` - T2, T3, T4, T5, T6, T7, T8 (2 pares), T9, T10, T11, T12 (2 pares) - e `false` para os outros 23; a lista esperada é escrita literalmente no teste a partir da «Tabela de transições» do plano (S1, AC 3; porta 3)
Proof: `RUN --test-name-pattern="tabela aceita exatamente 13 dos 36 pares" TAB`

**C4** - Pelo `VacanciesService` com banco real, para cada um dos 36 pares (vaga criada no estado de origem, horário já vencido quando o destino é `expirada`): os 13 pares da tabela terminam com a vaga no destino e 1 `Transition` nova; os 23 outros lançam 409 e deixam estado e contagem de `Transition` iguais (S1, AC 3)
Proof: `RUN --test-name-pattern="serviço segue a tabela nos 36 pares" SVC`

**C5** - Vagas em `realizada`, `expirada` e `cancelada` recusam com 409 a transição para cada um dos 6 estados (18 chamadas, 18 recusas, 0 `Transition` nova) (S1, AC 4)
Proof: `RUN --test-name-pattern="estados terminais recusam qualquer destino" SVC`

**C6** - `transition` com um uuid que não existe lança `NotFoundException` com `getStatus() = 404` e mensagem `Vaga não encontrada`, e o total de `Transition` do banco com esse `vacancyId` é 0 (S1, AC 5; porta 6)
Proof: `RUN --test-name-pattern="vaga inexistente recusa com 404" SVC`

**C7** - `meta.reason` igual a `''`, a `'   '` ou com 501 caracteres faz `transition` e `publish` rejeitarem, sem mudar `Vacancy.state` e sem gravar `Transition` (nem criar vaga, no `publish`); `reason` com exatamente 500 caracteres é aceito (S1, AC 6)
Proof: `RUN --test-name-pattern="motivo vazio, só espaços ou acima de 500 é recusado" SVC`

**C8** - A aplicação montada por `createApp` (a mesma de `main.ts` e do `startTestApp`) resolve `app.get(VacanciesService)` sem erro: o `VacanciesModule` exporta o serviço e o `AppModule` o importa (porta 1)
Proof: `RUN --test-name-pattern="app monta o VacanciesService" SVC`

### S2 - log na mesma transação · mesmos arquivos · ~6k

**C9** - `publish(data, { origin: 'clinica', reason: 'r' })` grava a vaga com `state = 'publicada'` e exatamente 1 `Transition` com `vacancyId` da vaga, `reservationId = null`, `fromState = null`, `toState = 'publicada'`, `origin = 'clinica'`, `reason = 'r'` (S2, AC 7; T1; porta 2)
Proof: `RUN --test-name-pattern="publish grava publicada e a primeira transição" SVC`

**C10** - `transition(id, 'alertando', { origin: 'motor', reason: 'onda 1' })` sem `tx` numa vaga `publicada` devolve a `Vacancy` com `state = 'alertando'` e grava 1 `Transition` com `fromState = 'publicada'`, `toState = 'alertando'`, `origin = 'motor'`, `reason = 'onda 1'` e `occurredAt` não nulo (S2, AC 8; porta 2)
Proof: `RUN --test-name-pattern="transição aceita grava from, to, origem e motivo" SVC`

**C11** - Publicar, `→ alertando`, `→ alertando`, `→ reservada`, `→ realizada` em sequência: `timeline(id)` devolve 5 linhas com os pares, nesta ordem, `null→publicada`, `publicada→alertando`, `alertando→alertando`, `alertando→reservada`, `reservada→realizada` (S2, AC 9; critério do card; F14)
Proof: `RUN --test-name-pattern="linha do tempo do card tem 5 linhas em ordem" SVC`

**C12** - Nas 5 linhas do cenário do C11, gravadas em sequência sem espera, cada `occurredAt` é estritamente maior que o anterior (diferença ≥ 1 ms), inclusive quando o relógio devolve o mesmo milissegundo (porta 5, D6 = a)
Proof: `RUN --test-name-pattern="occurredAt estritamente crescente por vaga" SVC`

**C13** - Com a gravação da `Transition` forçada a falhar depois do `updateMany` real (proxy sobre o cliente de transação real cujo `transition.create` rejeita), `transition` rejeita e a vaga continua no estado anterior, sem `Transition` nova (S2, AC 10)
Proof: `RUN --test-name-pattern="falha ao gravar a transição desfaz o update" SVC`

**C14** - `transition(id, 'alertando', meta, tx)` dentro de `prisma.$transaction` que lança erro depois da chamada: depois do rollback, `Vacancy.state` continua `publicada` e a contagem de `Transition` da vaga é a de antes (S2, AC 11; porta 2)
Proof: `RUN --test-name-pattern="rollback do chamador desfaz estado e transição" SVC`

**C15** - A mesma chamada do C14 numa `prisma.$transaction` que termina sem erro deixa a vaga em `alertando` com 1 `Transition` nova, e nenhuma `$transaction` interna é aberta (o serviço grava no `tx` recebido) (porta 2)
Proof: `RUN --test-name-pattern="com tx do chamador a transição entra no commit dele" SVC`

### S3 - concorrência · mesmos arquivos · ~2k

**C16** - Vaga em `alertando` com `Slot.startsAt` no passado, `Promise.allSettled([transition(id, 'reservada'), transition(id, 'expirada')])` repetido em 20 vagas: em cada rodada exatamente 1 `fulfilled`, 1 `rejected` com status 409, e a vaga ganha exatamente 1 `Transition` nova (S3, AC 12; porta 4)
Proof: `RUN --test-name-pattern="corrida reserva × expiração: só uma vence" SVC`

### S4 - expiração · mesmos arquivos · ~5k

**C17** - Com vagas vencidas (`startsAt ≤ now`) em `publicada` e em `alertando`, `expireDue(now)` devolve 2 e as duas ficam `expirada`, cada uma com 1 `Transition` `origin = 'motor'` e `toState = 'expirada'` (S4, AC 13; T8)
Proof: `RUN --test-name-pattern="expireDue expira publicada e alertando vencidas" SVC`

**C18** - No mesmo `expireDue(now)`: uma vaga `publicada` com `startsAt = now + 1 min` e vagas vencidas em `reservada`, `realizada`, `expirada` e `cancelada` terminam com o estado e a contagem de `Transition` iguais aos de antes (S4, AC 14)
Proof: `RUN --test-name-pattern="expireDue não toca futura nem outros estados" SVC`

**C19** - Segunda chamada de `expireDue(now)` com o mesmo `now` devolve 0 e não grava `Transition` (S4, AC 15)
Proof: `RUN --test-name-pattern="expireDue repetido devolve 0" SVC`

**C20** - As linhas de `Reservation` (uma `aguardando_pagamento` numa vaga `alertando` vencida e uma `confirmada` numa vaga `reservada` vencida) são iguais, campo a campo e em número, antes e depois de `expireDue(now)` (S4, AC 16)
Proof: `RUN --test-name-pattern="expireDue não altera reservas" SVC`

**C21** - `transition(id, 'expirada', …)` em vaga `publicada` e em vaga `alertando` com `Slot.startsAt = now + 1 h` lança 409 e deixa estado e contagem de `Transition` iguais (S4, AC 17; guarda de T8)
Proof: `RUN --test-name-pattern="expirar antes do horário recusa com 409" SVC`

**C22** - Três vagas `alertando` vencidas; uma transação concorrente aberta pelo teste muda a vaga A para `reservada` e só confirma depois que o `expireDue(now)` começou: `expireDue` devolve 2, as vagas B e C ficam `expirada`, A termina `reservada` sem `Transition` de expiração, e a chamada não rejeita (S4, AC 18)
Proof: `RUN --test-name-pattern="falha de uma vaga não para o expireDue" SVC`

### S5 - log da aplicação · mesmos arquivos · ~1k

**C23** - Na recusa do C1, o `Logger` do serviço recebe exatamente 1 chamada de `warn` cujo texto contém o `vacancyId`, `publicada`, `realizada` e a `origin`, e não contém o `reason` passado (marcador único no teste) (S5, AC 19)
Proof: `RUN --test-name-pattern="recusa registra warn sem motivo" SVC`

## Coverage

| Set (size)                                                                  | Member -> proof                                                                                          | Unproven |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| pares `VacancyState` × `VacancyState` (36)                                  | C3, table-driven over all 36 · C4, table-driven over all 36                                              | -        |
| arestas aceitas da tabela (12)                                              | T1 C9 · T2 C4 · T3 C4 · T4 C4 · T5 C4 · T6 C4 · T7 C4 · T8 C4 · T9 C4 · T10 C4 · T11 C4 · T12 C4         | -        |
| estados terminais (3)                                                       | `realizada` C5 · `expirada` C5 · `cancelada` C5                                                          | -        |
| erros da API do serviço (3)                                                 | 409 C1 · 404 C6 · motivo inválido C7                                                                     | -        |
| limites de `reason` (4)                                                     | vazio C7 · só espaços C7 · 500 aceito C7 · 501 recusado C7                                               | -        |
| métodos da API, porta 2 (4)                                                 | `publish` C9 · `transition` C10 · `expireDue` C17 · `timeline` C11                                       | -        |
| parâmetro `tx` (3)                                                          | sem `tx` C10 · `tx` confirmada C15 · `tx` desfeita C14                                                   | -        |
| estados no `expireDue` (6)                                                  | `publicada` C17 · `alertando` C17 · `reservada` C18 · `realizada` C18 · `expirada` C18 · `cancelada` C18 | -        |
| guarda de horário de T8 (2)                                                 | vencido aceita C17 · futuro recusa C21                                                                   | -        |
| portas de uma via em `Landing` (6)                                          | porta 1 C8 · porta 2 C9 · porta 3 C3 · porta 4 C16 · porta 5 C12 · porta 6 C1                            | -        |
| startup config: `VacanciesModule` no `AppModule` (1 montagem compartilhada) | `createApp`, usada por `main.ts` e `startTestApp` C8                                                     | -        |

- Afirmações com status ou mensagem de erro: C1, C6, C16, C21 - cada prova chama o método do serviço e lê `getStatus()` da exceção; não há rota HTTP (plan, `Surface` = Nenhum).
- C4 prova a tabela no limite (serviço + banco) e C3 na própria camada; os dois enumeram os 36 pares.
- Nenhum outro check afirma mais do que o caso que a sua prova exercita.

## Test policy

| Code                                                                                                           | Required proofs                                   | Coverage expectation                                 |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Decide, alcançado através de um limite (`vacancy-transitions.ts`, consumido pelo serviço)                      | um na própria camada (C3) **e** um no limite (C4) | os 36 pares nos dois                                 |
| Decide, com banco real (`vacancies.service.ts`: guarda de horário, update condicional, 404, motivo, transação) | integração contra o Postgres do worktree          | um caso afirmado por ramo: C1, C2, C6, C7, C13 a C22 |
| Montagem que não decide (`vacancies.module.ts`, import no `AppModule`)                                         | um no limite                                      | C8                                                   |

Evidence:

- `vacancy-transitions.ts`: mapa de 6 estados para 13 pares aceitos de 36 -> decide
- `vacancies.service.ts`: ramos - vaga inexistente, par fora da tabela, guarda `startsAt`, `count === 0`, motivo inválido, com/sem `tx`, laço do `expireDue` com falha isolada -> decide
- análogo no repo: nenhum serviço de domínio ainda (primeiro módulo); o padrão de integração contra o Postgres do worktree é o `src/testing/test-app.ts` + `src/app.test.ts`, que os testes reaproveitam

Cost: 23 provas em 2 arquivos de teste. Sem estas linhas, a tabela de 36 pares seria provada só pelo cenário de 5 transições do card.

## Swept

- validação: C7
- modos de falha: C13, C22
- idempotência: C19 - e a repetição de uma transição já aplicada (`reservada → reservada`) recebe 409 em C4
- autorização: não se aplica - nenhuma rota neste card; o controller do card chamador confere a clínica da sessão antes de chamar o serviço (plan, Out of scope)
- concorrência: C16, C22
- ciclo de vida do dado: não se aplica - nada é apagado nem migrado; `Vacancy` e `Transition` nascem vazias na fatia 2 do HACK-13
- falha de dependência: C13 - o banco falha entre o update e o insert; não há fornecedor externo
- transições de estado: C3, C4, C5, C21
- observabilidade: C23

Dimensões da casa: tenant - não se aplica, igual a autorização; dinheiro - não se aplica, nenhum valor; data - «horário chegou» é `Slot.startsAt ≤ now` em instantes UTC, sem calendário (C17, C21); schema - não muda (D6 = a); materializado - não se aplica; fornecedor - não se aplica.

## Handoff

- S1 a S5 tocam os mesmos 6 arquivos novos/alterados (`vacancies.module.ts`, `vacancies.service.ts`, `vacancy-transitions.ts`, os 2 testes e `app.module.ts`) e leem `schema.prisma` da fatia 2 (~7 KB), `prisma.service.ts`, `app.ts` e `test-app.ts` (~5 KB): ~12 KB lidos + ~45 KB escritos + plan e checks (~50 KB) = ~107 KB / 4 ≈ 27k, abaixo do orçamento de 150k - um construtor, sem pergunta.
- Ordem: só depois da PR da fatia 2 do HACK-13 em `main` → `git merge origin/main`, `docker compose up -d`, `npm run db:migrate -w @hackathon/api`; o primeiro commit leva `plan.md` e `checks.md`.
- Mecanismo: um construtor (dentro do orçamento, sem pergunta).
- **Boundary:** C1-C23 fechados em `a7abaa2` (base `b1bc276`).
- **Settled mid-build:** motivo inválido lança `BadRequestException` (400) e o motivo é gravado sem espaços nas pontas (o plano só pedia «recusar antes de gravar»; C7 não fixa o status); fixtures já seguem as regras da continuação da Fundação (horário e exame da mesma clínica, `Reservation.slotId` = horário da vaga, limpeza filho → pai), pedido do Maestro Motor; os testes de `expireDue` usam uma era própria (1981-1985) e drenam a era antes das fixtures, para não contar vaga de outro arquivo ou de execução anterior.
- **Abandoned:** `mock.method(prisma, '$transaction')` (o node:test não acha o método no cliente Prisma); C13 e C15 trocam o método à mão e restauram no `finally`.
