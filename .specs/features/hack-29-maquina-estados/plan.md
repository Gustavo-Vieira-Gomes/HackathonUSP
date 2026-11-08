# HACK-29 · 3.1 Máquina de estados da vaga e log de transições

O build espera a PR da **fatia 2 do HACK-13** (`Slot`, `Vacancy`, `Reservation`, `Alert`, `Transition` e os enums) em `main`: antes de construir, `git merge origin/main` no worktree, `docker compose up -d` e `npm run db:migrate -w @hackathon/api`. Nada empilhado.

## Problem

Com a fatia 2 do HACK-13, o banco aceita qualquer valor de `VacancyState` em qualquer ordem: nada impede que uma vaga `publicada` vire `realizada` (gera cobrança sem reserva, RN-45/46) ou que uma vaga `expirada` volte a `reservada`. Quatro cards vão mudar o estado da vaga - o sincronizador da agenda (HACK-19), a publicação e o no-show (HACK-20), o pagamento do sinal (HACK-27) e o cron de ondas e expiração (HACK-32) - e, sem um dono único, cada um escreveria o seu `update` com a sua própria noção de ordem. O log das transições (RN-50), de onde saem a linha do tempo (F14) e todas as métricas (RN-51), dependeria de cada um lembrar de gravar a linha, e uma mudança de estado sem linha no log é uma métrica errada que ninguém percebe.

O card está no caminho crítico (`docs/product/fluxo-de-trabalho.md`: 0.1 → 0.2 → 3.1 → 1.4 e 3.4 → 2.5) e bloqueia HACK-19, 20, 27 e 32. Não traz número de esforço; o prazo é o do hackathon.

A spec também não fecha o caminho: a RN-24 dá uma ordem linear (`publicada → alertando → reservada → realizada | expirada | cancelada`), mas RN-19, 33, 34, 48, 49 e 29/30 pedem caminhos que ela não tem (achado da Fundação, «Fora do card» do plano da fatia 2). Este plano propõe a tabela completa e sobe ao Gustavo o que não se deduz da spec (seção «Decisões»).

Quando isto entrar: quem precisa mudar o estado de uma vaga injeta o `VacanciesService` (o `VagasService` do card) e chama um método; transição fora da tabela recebe 409 sem gravar nada; toda transição aceita grava uma `Transition` na mesma transação; o cron do HACK-32 chama um método que expira as vagas vencidas.

## Flow

Reaproveita o `PrismaService` global do HACK-12, os modelos e enums da fatia 2 do HACK-13 e as exceções HTTP nativas do Nest (`ConflictException` = 409, `NotFoundException` = 404); nenhum segundo cliente Prisma, nenhum filtro de erro próprio.

1. chamador (HACK-19, 20, 27, 32; nenhum existe ainda) injeta `VacanciesService` exportado pelo `VacanciesModule` (novo, porta 1) e chama `publish`, `transition` ou `expireDue`, opcionalmente passando a transação Prisma em que já está (porta 2).
2. `VacanciesService` (novo, porta 1) lê o estado atual da vaga pelo `PrismaService` (existente, HACK-12) e consulta a tabela de transições permitidas (novo, porta 3); par fora da tabela ou guarda que falha → `ConflictException` (409) antes de qualquer escrita.
3. `VacanciesService` grava a mudança de estado com `UPDATE … WHERE id = ? AND state = <estado lido>` (novo, porta 4) e, na mesma transação, a linha de `Transition` (existente, HACK-13 fatia 2, porta 7 dela) com `fromState`, `toState`, `origin`, `reason` e `occurredAt`; zero linhas atualizadas (outro chamador mudou o estado entre a leitura e a escrita) → 409 e nada gravado.
4. `expireDue(now)` (novo, porta 2) busca as vagas `publicada` ou `alertando` cujo `Slot.startsAt` ≤ `now` e passa cada uma a `expirada` pelo mesmo caminho dos passos 2 e 3, uma transação por vaga, origem `motor`; o agendamento (`@Cron`) é do HACK-32.
5. `timeline(vacancyId)` (novo, porta 2) devolve as `Transition` da vaga em ordem cronológica (F14); a ordem é garantida pela porta 5.
6. out: o chamador recebe a `Vacancy` atualizada (ou o número de vagas expiradas); nenhuma rota HTTP nasce neste card - o 409 chega ao cliente pela rota do card chamador, que deixa a exceção subir.

## Impact

| Front         | What changes                                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| domain        | termo novo: **tabela de transições da vaga** - o conjunto fechado de pares (de, para) aceitos, em `apps/api/src/modules/vacancies/`; fonte única de RN-24 no código                                  |
| domain        | termo existente: `VagasService` do card = `VacanciesService` no código (identificadores em inglês, como os modelos da fatia 2)                                                                       |
| domain        | termo novo: **origem da transição** - `agenda`, `clinica`, `paciente`, `motor` (enum `TransitionOrigin` da fatia 2); quem chama informa, o serviço grava                                             |
| outros cards  | HACK-19, 20, 27 e 32 passam a mudar `Vacancy.state` só pelo `VacanciesService`; `prisma.vacancy.update({ data: { state } })` direto fica proibido fora do módulo (regra de revisão, ver Assumptions) |
| outros cards  | HACK-27 recebe 409 quando a vaga mudou de estado entre o aceite e a confirmação (expirou ou outro paciente reservou); traduz para a mensagem dele                                                    |
| contratos     | `packages/contracts` não muda: nenhuma rota neste card                                                                                                                                               |
| schema.prisma | não muda; se a Decisão D6 escolher a coluna `sequence`, a mudança vai à frente Fundação antes da fatia 2 entrar em `main`                                                                            |
| stored data   | nada a migrar - as tabelas nascem vazias na fatia 2                                                                                                                                                  |

## Relations

Nenhum - nenhuma mudança na forma do dado; o card só usa `Vacancy`, `Slot` e `Transition` como a fatia 2 do HACK-13 os cria (Transition com exatamente um alvo; aqui sempre `vacancyId`). Se D6 escolher a opção (b), a coluna nova é da fatia 2, não deste card.

## Surface

Nenhum - nenhuma rota HTTP nova nem alterada. A superfície é a API TypeScript do `VacanciesService`, consumida por outros cards; a forma literal está na porta 2.

## Landing

| One-way door                                         | Literal shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Alternative rejected                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Dono único das transições da vaga                 | `apps/api/src/modules/vacancies/vacancies.module.ts` com `@Module({ providers: [VacanciesService], exports: [VacanciesService] })`, importado no `AppModule`; é o primeiro módulo de domínio do Nest e vira o molde dos próximos                                                                                                                                                                                                                                                                                                                                                                              | transições espalhadas nos serviços de cada card (quatro cópias da regra, contra design-patterns: transição de estado tem dono único desde a primeira implementação); máquina de estados como biblioteca (`xstate`) (dependência nova para seis estados e uma tabela)             |
| 2. API do serviço, consumida por HACK-19, 20, 27, 32 | `type TransitionMeta = { origin: TransitionOrigin; reason: string }`; `publish(data: Omit<Prisma.VacancyUncheckedCreateInput, 'state'>, meta: TransitionMeta, tx?: Prisma.TransactionClient): Promise<Vacancy>`; `transition(vacancyId: string, to: VacancyState, meta: TransitionMeta, tx?: Prisma.TransactionClient): Promise<Vacancy>`; `expireDue(now?: Date): Promise<number>`; `timeline(vacancyId: string): Promise<Transition[]>`. Sem `tx`, o método abre o próprio `$transaction`; com `tx`, grava dentro da transação do chamador (HACK-27 confirma a reserva e reserva a vaga na mesma transação) | método por evento (`startAlerting`, `reserve`, `markDone`…) (seis a dez métodos que só repetem a tabela; cada transição nova da Decisão vira método novo); `from` explícito no argumento (o chamador já não sabe o estado atual com certeza - é exatamente a corrida da porta 4) |
| 3. Tabela de transições como dado                    | `const VACANCY_TRANSITIONS: Readonly<Record<VacancyState, readonly VacancyState[]>>` com os pares da tabela de «Tabela de transições» abaixo (recomendadas aplicadas) e `canTransition(from, to): boolean` exportada do módulo                                                                                                                                                                                                                                                                                                                                                                                | `switch` por estado dentro do método (a regra fica ilegível e não se testa a tabela inteira); regra no banco por trigger (a fatia 2 rejeitou: é regra de negócio, não forma do dado)                                                                                             |
| 4. Concorrência por update condicional               | `tx.vacancy.updateMany({ where: { id, state: current }, data: { state: to } })`; `count === 0` → `ConflictException`; a linha de `Transition` só é inserida depois de `count === 1`, na mesma transação                                                                                                                                                                                                                                                                                                                                                                                                       | `SELECT … FOR UPDATE` (exige SQL cru e todo método lembrar do lock); ler e gravar sem condição (duas transações leem `alertando`, uma reserva e outra expira, e as duas gravam - vaga `expirada` com reserva paga)                                                               |
| 5. Ordem da linha do tempo                           | **D6 (a), decidida pelo Maestro Motor:** o serviço grava `occurredAt = max(agora, occurredAt da última transição da vaga + 1 ms)`, lido dentro da mesma transação depois do update da porta 4 (o update trava a linha da vaga, então duas transições da mesma vaga não intercalam); `timeline` ordena por `occurredAt`                                                                                                                                                                                                                                                                                        | `@default(now())` puro (duas transições no mesmo milissegundo empatam e a ordem do critério do card vira sorte); ordenar por `id` (uuid v4 não tem ordem)                                                                                                                        |
| 6. Erro de transição proibida                        | `throw new ConflictException(\`Transição de vaga inválida: ${from} → ${to}\`)`- corpo padrão do Nest`{ statusCode: 409, message, error: 'Conflict' }`; vaga inexistente: `NotFoundException('Vaga não encontrada')` (404)                                                                                                                                                                                                                                                                                                                                                                                     | exceção de domínio própria + filtro (camada sem necessidade: o card pede 409 e o Nest já tem a exceção); `BadRequestException` 400 (o pedido é bem formado; o conflito é com o estado atual)                                                                                     |

- Nada mais nesta mudança é difícil de reverter: nomes de método privado, divisão de arquivos e mensagens de log se decidem no diff.

### Tabela de transições

Estados de `VacancyState` (fatia 2, porta 1): `publicada`, `alertando`, `reservada`, `realizada`, `expirada`, `cancelada`. Terminais: `realizada`, `expirada`, `cancelada` (nenhuma saída). Coluna «Fonte»: **spec** = literal em RN-24; **deduzida** = outra RN pede e o texto basta; **D<n>** = regra de negócio que a spec não fecha, em «Decisões», escrita aqui com a opção decidida.

| #   | De → para                                             | Origem esperada                                                           | RN                                                                                                   | Fonte                                                                       | Guarda no serviço                                                              |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| T1  | (nenhum) → `publicada`                                | `agenda` (RN-08), `clinica` (RN-22 b/c), `motor` (vaga de no-show, RN-30) | RN-22                                                                                                | spec                                                                        | `publish`; RN-23/28/32 são do chamador (HACK-19, 20)                           |
| T2  | `publicada` → `alertando`                             | `motor`                                                                   | RN-24, RN-34                                                                                         | spec                                                                        | -                                                                              |
| T3  | `alertando` → `alertando`                             | `motor`                                                                   | RN-34 (próxima onda)                                                                                 | deduzida - critério do card exige uma linha por onda («2 ondas … 5 linhas») | só `alertando`; nenhum outro estado aceita `x → x`                             |
| T4  | `alertando` → `publicada`                             | `motor`                                                                   | RN-34 («esgotadas as inscrições compatíveis, a vaga continua `publicada` até expirar»)               | deduzida                                                                    | -                                                                              |
| T5  | `publicada` → `reservada`                             | `paciente`                                                                | RN-19 (inscrição já com vaga compatível vai direto ao aceite), F9 (vaga esgotada «aparece na busca») | deduzida                                                                    | -                                                                              |
| T6  | `alertando` → `reservada`                             | `paciente`                                                                | RN-24, RN-41                                                                                         | spec                                                                        | -                                                                              |
| T7  | `reservada` → `realizada`                             | `clinica`                                                                 | RN-24, RN-45                                                                                         | spec                                                                        | -                                                                              |
| T8  | `publicada` → `expirada` e `alertando` → `expirada`   | `motor`                                                                   | RN-25, F6 «Vaga expira»                                                                              | spec                                                                        | `Slot.startsAt` ≤ agora; senão 409                                             |
| T9  | `reservada` → `publicada`                             | `paciente` (RN-49), `clinica` (RN-48), `agenda` (RN-08)                   | RN-49, RN-48, RN-08                                                                                  | D2                                                                          | «se ainda couber» (RN-23) é decidido pelo chamador antes de escolher T9 ou T10 |
| T10 | `reservada` → `cancelada`                             | `paciente`, `clinica`, `agenda`, `motor`                                  | RN-49/48/08 quando não cabe; RN-33 quando não cabe; RN-29/30 (no-show)                               | D2, D3, D4                                                                  | -                                                                              |
| T11 | `reservada` → `alertando`                             | `motor`                                                                   | RN-33 (aceitou no-show e não chegou em Y)                                                            | D3                                                                          | «se ainda couber no intervalo» é do chamador (HACK-32/33)                      |
| T12 | `publicada` → `cancelada` e `alertando` → `cancelada` | `clinica`, `agenda`                                                       | RN-24 (estado `cancelada`), RN-09/RN-10 (horário ocupado por evento da agenda)                       | D5                                                                          | -                                                                              |

Proibidas (409), entre outras: qualquer saída de `realizada`, `expirada` ou `cancelada`; `publicada → realizada` (F6 «Transição inválida», critério do card); `alertando → realizada`; `reservada → expirada` (vaga com reserva não expira sozinha, RN-25 «vaga sem reserva»); `publicada → publicada`, `reservada → reservada`.

## Criteria

### S1: só transições da tabela passam, e a recusada não grava nada (P1)

A RN-24 com mecanismo: o serviço é o único caminho e recusa com 409 o que está fora da tabela.

**Acceptance Criteria**

1. QUANDO `transition(id, 'realizada', …)` é chamado para uma vaga em `publicada` ENTÃO o sistema DEVE lançar `ConflictException` com status 409 e mensagem `Transição de vaga inválida: publicada → realizada`.
2. SE uma transição é recusada ENTÃO o sistema DEVE manter `Vacancy.state` igual ao de antes e o número de linhas de `Transition` da vaga igual ao de antes.
3. O sistema DEVE aceitar exatamente os pares T1 a T12 da «Tabela de transições» e recusar com 409 todos os outros pares dos 6 × 6 estados de `VacancyState`.
4. SE a vaga está em `realizada`, `expirada` ou `cancelada` ENTÃO o sistema DEVE recusar com 409 a transição para qualquer estado.
5. SE `transition` recebe um `vacancyId` que não existe ENTÃO o sistema DEVE lançar `NotFoundException` com status 404 e não DEVE gravar `Transition`.
6. SE `meta.reason` está vazio ou só com espaços, ou passa de 500 caracteres ENTÃO o sistema DEVE recusar antes de gravar e não DEVE mudar `Vacancy.state` nem gravar `Transition`.

**Independent test:** `npm run test -w @hackathon/api` com o banco do worktree no ar; o teste cria clínica, exame, horário e vaga pelo Prisma e prova 1 a 6, incluindo a tabela inteira (36 pares).

### S2: toda transição aceita grava a Transition na mesma transação (P1)

RN-50: o log não depende de o chamador lembrar.

**Acceptance Criteria**

7. QUANDO `publish` cria uma vaga ENTÃO o sistema DEVE gravá-la em `publicada` e gravar uma `Transition` com `vacancyId` da vaga, `reservationId` nulo, `fromState` nulo, `toState = 'publicada'` e a `origin` e o `reason` recebidos.
8. QUANDO uma transição é aceita ENTÃO o sistema DEVE gravar uma `Transition` com `fromState` igual ao estado anterior, `toState` igual ao novo, a `origin` e o `reason` recebidos e `occurredAt` preenchido.
9. QUANDO uma vaga é publicada, alertada em 2 ondas, reservada e realizada ENTÃO `timeline(id)` DEVE devolver 5 linhas, nesta ordem: `∅ → publicada`, `publicada → alertando`, `alertando → alertando`, `alertando → reservada`, `reservada → realizada` (critério do card; F14 «Linha do tempo da vaga»).
10. SE a gravação da `Transition` falha depois do update do estado ENTÃO o sistema DEVE desfazer o update e a vaga DEVE continuar no estado anterior.
11. QUANDO `transition` recebe `tx` e a transação do chamador é desfeita depois da chamada ENTÃO o sistema DEVE deixar `Vacancy.state` e as `Transition` da vaga como estavam antes da transação.

**Independent test:** mesmo arquivo; o cenário do card (publicar, 2 ondas, reservar, realizar) com `timeline`; falha da `Transition` provocada por `reason` que viola o banco ou por exceção lançada dentro do `tx` do chamador.

### S3: duas mudanças concorrentes da mesma vaga, só uma vence (P1)

A corrida entre o paciente que reserva e o cron que expira no mesmo instante.

**Acceptance Criteria**

12. QUANDO duas transições da mesma vaga em `alertando` rodam ao mesmo tempo, em duas transações concorrentes (`→ reservada` e `→ expirada`) ENTÃO exatamente uma DEVE terminar com sucesso, a outra DEVE receber 409, e a vaga DEVE ganhar exatamente uma `Transition` nova.

**Independent test:** mesmo arquivo; `Promise.allSettled` das duas chamadas com o horário já vencido, repetido 20 vezes; cada rodada confere um `fulfilled`, um `rejected` 409 e uma linha nova.

### S4: a vaga sem reserva expira no horário, sem cobrança (P1)

RN-25 e F6 «Vaga expira»; o cron que chama é do HACK-32.

**Acceptance Criteria**

13. QUANDO `expireDue(now)` roda ENTÃO o sistema DEVE passar a `expirada`, com `origin = 'motor'`, toda vaga em `publicada` ou `alertando` cujo `Slot.startsAt` ≤ `now`, e DEVE devolver quantas expirou.
14. O `expireDue(now)` não DEVE mudar vagas com `Slot.startsAt` > `now`, nem vagas em `reservada`, `realizada`, `expirada` ou `cancelada`.
15. QUANDO `expireDue(now)` roda duas vezes seguidas com o mesmo `now` ENTÃO a segunda execução DEVE devolver 0 e não DEVE gravar `Transition`.
16. O `expireDue` não DEVE criar, alterar ou apagar nenhuma linha de `Reservation`.
17. SE `transition(id, 'expirada', …)` é chamado para uma vaga cujo `Slot.startsAt` está no futuro ENTÃO o sistema DEVE recusar com 409 e não DEVE gravar nada.
18. SE a transição de uma vaga falha dentro do `expireDue` (409 por corrida) ENTÃO o sistema DEVE seguir com as demais vagas vencidas e não DEVE contar a que falhou.

**Independent test:** mesmo arquivo; três vagas (vencida em `publicada`, vencida em `alertando`, futura) e uma `reservada` vencida; `expireDue(now)` devolve 2; segunda chamada devolve 0.

### S5: transição recusada fica registrada no log da aplicação (P2)

Observabilidade sem dado pessoal.

**Acceptance Criteria**

19. QUANDO uma transição é recusada com 409 ENTÃO o sistema DEVE registrar uma linha de log em nível `warn` com `vacancyId`, estado atual, estado pedido e `origin`, sem `reason` e sem dado de paciente.

**Independent test:** mesmo arquivo; espiona o `Logger` do serviço e confere a linha numa recusa.

## Out of scope

| Excluded                                                                                                               | Why                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Máquina de estados da `Reservation` (`aguardando_pagamento → confirmada → realizada / no_show / cancelada / expirada`) | o card só entrega a vaga (D1 = a, decidida pelo Maestro Motor); a reserva é do HACK-27 e dos cards de no-show e cancelamento |
| O `@Cron` que chama `expireDue` a cada minuto e as ondas de alerta                                                     | HACK-32 (3.4)                                                                                                                |
| Regras de publicação: antecedência e preparo (RN-23), teto diário (RN-28), Y no intervalo (RN-32)                      | HACK-20 e HACK-19 validam antes de chamar `publish`                                                                          |
| Decidir «se ainda couber» (RN-33, 48, 49)                                                                              | o chamador decide e escolhe T9/T11 ou T10; aqui só a tabela aceita os dois caminhos                                          |
| Cancelar alertas pendentes quando a vaga é reservada ou expira (RN-36)                                                 | HACK-32/34                                                                                                                   |
| Rota HTTP de linha do tempo ou de métricas (F14, RN-51)                                                                | card de métricas; aqui só `timeline()` no serviço                                                                            |
| Autorização por clínica (RN-04)                                                                                        | o controller do card chamador confere que a vaga é da clínica da sessão antes de chamar o serviço                            |

## Assumptions

| Assumption                           | Chosen default                                                                                                                                                                                                                                                          | Rationale                                                                                 | Confirmed? |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| Fonte das entidades                  | fatia 2 do HACK-13 (`hack-13-modelo-dados-fatia-2/plan.md`): `Vacancy.state: VacancyState`, `Vacancy.slotId`, `Slot.startsAt`, `Transition` com `vacancyId`/`reservationId` exclusivos, `fromState`/`toState` texto, `origin: TransitionOrigin`, `reason`, `occurredAt` | correção do Maestro Motor em 08/11/2026; o build espera a PR da fatia 2 em `main`         | y          |
| Nome do serviço                      | `VacanciesService` em `apps/api/src/modules/vacancies/`                                                                                                                                                                                                                 | identificadores em inglês como os modelos da fatia 2; o card chama de `VagasService`      | n          |
| Origem por aresta                    | a coluna «Origem esperada» documenta; o serviço grava a origem recebida e **não** recusa origem fora da coluna                                                                                                                                                          | RN-50 pede registrar, não restringir; restringir sem RN seria regra inventada             | n          |
| Limite do `reason`                   | obrigatório, sem espaços nas pontas, 1 a 500 caracteres                                                                                                                                                                                                                 | o card exige motivo; 500 cabe qualquer frase e barra payload acidental                    | n          |
| Expiração por vaga                   | uma transação por vaga no `expireDue`, falha de uma não para as outras                                                                                                                                                                                                  | uma corrida com o pagamento não pode desfazer a expiração das outras vagas vencidas       | n          |
| «Horário chegou»                     | `Slot.startsAt` ≤ `now`, instantes em UTC                                                                                                                                                                                                                               | card: «ao chegar no horário»; RN-25: «expira no horário do exame»                         | n          |
| Retentativa do chamador              | repetir uma transição já aplicada (webhook do sinal chegando duas vezes) recebe 409, pois `reservada → reservada` não está na tabela                                                                                                                                    | o chamador (HACK-27) trata o 409 da repetição; o serviço não guarda chave de idempotência | n          |
| Proibir update direto fora do módulo | regra de revisão de PR, sem lint custom                                                                                                                                                                                                                                 | uma regra de lint própria para um hackathon custa mais que a revisão                      | n          |
| Porta e banco do worktree            | Postgres 54329, banco `hack_29`, API 3291, Next 3290 (`.env` locais criados, fora do git)                                                                                                                                                                               | contrato dos maestros: banco e portas por worktree                                        | y          |

### Decisões

Todas decididas em 08/11/2026, todas na opção recomendada (a): D1 e D6 pelo Maestro Motor; D2 a D5 pelo Gustavo, levadas pelo Maestro Motor e pelo maestro-geral. O plano já está escrito com essas opções; as alternativas ficam registradas com o trade-off.

**D1 - Escopo: só a vaga, ou vaga e reserva.** A RN-50 pede log da vaga e da reserva; o card só fala da vaga. **Decidida pelo Maestro Motor em 08/11/2026: (a).**

- (a) **Só a vaga neste card (recomendada).** É o que o card entrega e o que destrava HACK-19/20/27/32. Trade-off: a máquina da reserva (RN-41/42/45/29) nasce no HACK-27, que grava a própria `Transition` com `reservationId` - duas escritas de `Transition` em dois serviços.
- (b) Vaga e reserva aqui. Um dono só do log. Trade-off: o card cresce ~50%, com regras de reserva que ainda dependem do desenho do pagamento (HACK-27), e o caminho crítico atrasa.

**D2 - Reserva de encaixe cancelada (RN-49 paciente, RN-48 clínica, RN-08 evento apagado na agenda): o que acontece com a vaga.** **Decidida pelo Gustavo em 08/11/2026 (via Maestro Motor e maestro-geral): (a).**

- (a) **A mesma vaga volta a `publicada` (T9) se ainda couber; se não couber, vai a `cancelada` (T10) (recomendada).** Segue o texto da RN-49 («vaga volta a `publicada`»); os três casos ficam iguais e a vaga guarda a história inteira na linha do tempo. Trade-off: na RN-48 a vaga mantém a origem original (por exemplo `vazio`), não `cancelamento`.
- (b) A vaga vai a `cancelada` e o chamador cria uma vaga nova (origem `cancelamento`) se couber. Trade-off: contradiz o texto da RN-49; o horário ganha duas vagas e a taxa de preenchimento (RN-51) conta uma vaga não preenchida a mais.
- (c) Quando não couber, `expirada` em vez de `cancelada`. Trade-off: `expirada` passa a significar duas coisas (ninguém reservou, RN-25; reservou e desistiu).
- Muda: T9, T10.

**D3 - Quem aceitou um no-show e não chegou em Y (RN-33): a vaga volta para a próxima pessoa.** **Decidida pelo Gustavo em 08/11/2026 (via Maestro Motor e maestro-geral): (a).**

- (a) **`reservada → alertando` direto (T11), origem `motor`; se não couber mais no intervalo, `reservada → cancelada` (T10) (recomendada).** Uma linha no log, e a vaga volta ao estado em que as ondas rodam. Trade-off: mais uma aresta fora da ordem da RN-24.
- (b) `reservada → publicada` e depois `publicada → alertando` (duas linhas). Reaproveita T9 e T2. Trade-off: duas linhas para um evento só; entre as duas, a vaga aparece como `publicada` na busca.
- Muda: T11, T10.

**D4 - No-show numa vaga `reservada` (RN-29/30): a vaga velha vai para qual estado antes de a vaga de no-show nascer no mesmo horário.** A fatia 2 exige que ela saia de `publicada`/`alertando`/`reservada` antes (uma vaga ativa por horário, porta 3 dela). **Decidida pelo Gustavo em 08/11/2026 (via Maestro Motor e maestro-geral): (a).**

- (a) **`reservada → cancelada` (T10), origem `clinica`, motivo citando o no-show; a falta fica na reserva (`ReservationState.no_show`) (recomendada).** Sem mudança de schema; `expirada` continua só RN-25; o comparecimento do encaixe (RN-51) sai da reserva. Trade-off: «cancelada» para algo que ninguém cancelou - só o motivo diz que foi no-show.
- (b) `reservada → expirada`. Trade-off: `expirada` deixa de significar «sem reserva» (RN-25).
- (c) Valor novo `no_show` em `VacancyState`. O estado diz o que houve. Trade-off: mudança no `schema.prisma` da Fundação antes da fatia 2 entrar em `main`, e a reserva já carrega a mesma informação.
- Muda: T10.

**D5 - Vaga ainda não reservada pode ser cancelada?** A RN-24 tem `cancelada` como fim, mas nenhuma RN diz de onde. Casos: a clínica retira a vaga; o horário é ocupado por um evento na agenda. **Decidida pelo Gustavo em 08/11/2026 (via Maestro Motor e maestro-geral): (a).**

- (a) **Sim: `publicada`/`alertando` → `cancelada` (T12), origem `clinica` ou `agenda` (recomendada).** Sem isso, um horário que a clínica preencheu por fora continua oferecido até expirar e um paciente pode pagar sinal por um horário que não existe. Trade-off: os cards chamadores precisam decidir quando cancelar (HACK-19 para a agenda; tela da clínica em outro card).
- (b) Não neste card; só `reservada` pode ir a `cancelada`. Trade-off: o risco acima fica até alguém precisar.
- Muda: T12.

**D6 (técnica, para o Maestro) - Ordem garantida da linha do tempo.** O critério do card exige «5 linhas na ordem certa», e `occurredAt @default(now())` em milissegundo empata em sequência rápida. **Decidida pelo Maestro Motor em 08/11/2026: (a).**

- (a) **O serviço grava `occurredAt` estritamente crescente por vaga (porta 5) (recomendada).** Sem mudança de schema. Trade-off: em empate o instante gravado pode ficar até poucos milissegundos à frente do real.
- (b) A Fundação acrescenta `sequence BigInt @default(autoincrement())` em `Transition` na fatia 2 e a linha do tempo ordena por ela. Ordem exata e independente do relógio. Trade-off: mexe no plano da fatia 2 antes do merge.
- Muda: porta 5.

| #   | Kind   | Question                                                                                                                        | Until answered                                                                             |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | open   | D2 a D5. **Respondidas pelo Gustavo em 08/11/2026 (via Maestro Motor e maestro-geral):** D2 = (a), D3 = (a), D4 = (a), D5 = (a) | aplicadas na «Tabela de transições» (T9 a T12) e nos critérios 3 e 9                       |
| 2   | open   | D1 e D6. **Respondidas pelo Maestro Motor em 08/11/2026:** D1 = (a) só a vaga; D6 = (a) `occurredAt` crescente no serviço       | aplicadas em Out of scope (máquina da reserva) e na porta 5                                |
| 3   | blocks | PR da fatia 2 do HACK-13 em `main`                                                                                              | nenhum critério se prova sem `Vacancy`, `Slot` e `Transition` no banco; o build não começa |

**Perguntas abertas:** nenhuma - a 3 se resolveu com a fatia 2 do HACK-13 em `main` (PR #8, `b0680a2`), mergeada no worktree antes do build. D1 a D6 decididas em 08/11/2026 (D1 e D6 pelo Maestro Motor, D2 a D5 pelo Gustavo).

### Fora do card

- **Máquina da reserva sem dono.** Se D1 ficar em (a), o HACK-27 precisa nascer com o mesmo molde (tabela, update condicional, `Transition` na mesma transação) para `ReservationState`; vale avisar o maestro do 2.5.
- **Reserva em `aguardando_pagamento` quando a vaga expira.** `expireDue` não toca reservas (critério 16); expirar a tentativa de pagamento pendente (RN-42) é do HACK-27/32. Sem isso, a tentativa pode ser confirmada depois e receber 409 da vaga - o HACK-27 tem de tratar.
- **RN-16 (reserva comum e de encaixe do mesmo exame).** Cancelar a de encaixe porque o paciente confirmou a comum usa T9/T10 com outro motivo; quem decide é o HACK-27.
- **RN-24 na spec.** A spec ainda diz «transições fora dessa ordem são recusadas» com a ordem linear; depois das respostas D2–D5, vale atualizar a RN-24 em `docs/product/marketplace-vagas-imagem.md` para apontar a tabela (doc, não código).

## Observable

| Surface                                                               | Decision                       | Landing                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| API TypeScript `VacanciesService` (consumida por HACK-19, 20, 27, 32) | formato de retorno             | porta 2 - `Vacancy` atualizada, `number` no `expireDue`, `Transition[]` na `timeline`                               |
| API TypeScript `VacanciesService`                                     | formato de erro e códigos      | AC 1 (409 com mensagem), AC 5 (404), AC 6 (motivo inválido); porta 6                                                |
| API TypeScript `VacanciesService`                                     | quem pode chamar               | não se aplica - chamada interna entre módulos Nest; autorização por clínica é do controller chamador (Out of scope) |
| API TypeScript `VacanciesService`                                     | versionamento e limite de taxa | não se aplica - API interna do mesmo processo, sem cliente externo                                                  |
| método `expireDue` chamado pelo cron do HACK-32                       | saída e falha no meio          | AC 13 (devolve quantas expirou), AC 18 (falha de uma vaga não para as outras)                                       |
| método `expireDue`                                                    | flags e padrões                | porta 2 - `now` opcional, padrão `new Date()`                                                                       |
| método `expireDue`                                                    | código de saída                | não se aplica - método, não processo; o cron do HACK-32 registra o resultado                                        |
| rotas HTTP                                                            | formato, erro, quem chama      | não se aplica - nenhuma rota neste card                                                                             |
| telas                                                                 | vazio, carregando, erro        | não se aplica - nenhuma tela neste card                                                                             |

## Sources

- Card HACK-29 no Linear - https://linear.app/workspace-do-gustavo/issue/HACK-29/31-maquina-de-estados-da-vaga-e-log-de-transicoes - entrega e critérios (409 em `publicada → realizada`; 5 linhas após publicar, 2 ondas, reservar e realizar); sem comentários em 08/11/2026
- Plano da fatia 2 do HACK-13 - `/Users/User/Documents/Programacao/pessoal/HackathonUSP/.worktrees/HACK-13/.specs/features/hack-13-modelo-dados-fatia-2/plan.md` - `Vacancy`, `Slot`, `Transition`, enums `VacancyState` e `TransitionOrigin` (portas 1, 3 e 7) e o «Fora do card» com os três conflitos da RN-24
- `docs/product/marketplace-vagas-imagem.md` - RN-19, 22 a 25, 29, 30, 33, 34, 41, 45, 48, 49, 50; cenários F6 «Vaga expira» e «Transição inválida», F14 «Linha do tempo da vaga»
