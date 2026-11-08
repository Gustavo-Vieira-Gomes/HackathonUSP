# HACK-32 checks

Profile: standard
Plan: `.specs/features/hack-32-cron-ondas/plan.md`

Perfil `standard` e não `light`: o card mexe em preço (`currentPriceCents`, RN-27), em transição de estado (T2, T3, T4, T8), em concorrência entre ticks (ressalva 1 do HACK-29) e em envio de alerta a paciente (RN-36, um alerta por paciente por vaga). Na dúvida entre dois perfis, o mais alto.

35 checks em 8 fatias · 4 portas de uma via · 1 pergunta aberta que bloqueia o build (pergunta 1: PR #17 do HACK-30/31/34, com o `ClockService`, em `main`)

**Dependentes do relógio em `main`.** Os checks marcados com **[relógio]** (C22 a C26 e C32) consomem o `ClockService` do HACK-30 (PR #17, `apps/api/src/modules/clock/clock.service.ts`): `now()`, `refresh()`, `advance(minutes)` só para frente e `reset()`. Eles só podem ser escritos e rodados depois que a #17 entrar em `main` e o worktree fizer `git merge origin/main`. O build inteiro espera a #17 (plan, pergunta 1): o construtor do `VacanciesService` passa a receber o relógio, a etapa `prices` chama o `PricingService` e o `enviar` muda para `enviar(patientId, …)`, tudo dela.

**Relógio nos testes.** O deslocamento vive na linha `DemoClock` do banco `hack_32`, compartilhada pelos arquivos de teste. Todo teste que avança o relógio chama `clock.reset()` antes e no `finally`, como `pricing.service.test.ts:181-196` e `clock.http.test.ts:16-25` da #17. Como o `reset` não resolve a corrida entre arquivos, o script `test` da API passa a rodar os arquivos em série (`--test-concurrency=1`, commit próprio; plan, Assumption «Testes da API em série»); o tempo da suíte é medido antes e depois, e acima de 2x o build para e avisa o Maestro.

**Ajuste à PR #17.** C11, C19 e C25 ajustados à #17 em 08/11/2026, aprovado pelo Maestro Motor: a mudança vem da dependência, não de escopo novo.

**Exemplo de preço.** C19, C20 e C21 (e o AC 14 do plano): exemplo corrigido em 08/11 (aritmética dos degraus), aprovado pelo Maestro Motor. Faltando 30 h vale o degrau de 48 h (−10%): 72000 → 64800, não 57600; a regra não muda.

**Como as provas rodam.** Em `apps/api`, com o Postgres do worktree no ar (`127.0.0.1:54329`, banco `hack_32`, `DATABASE_URL` do `.env` da API conferido antes, nunca banco compartilhado), depois de `npx prisma generate && npx tsc -p tsconfig.json --outDir .test-dist` (o mesmo passo do `npm run test`). O `node --test` só filtra com `--test-name-pattern` **antes** do arquivo. Abreviações: `RUN` = `node --env-file-if-exists=.env --test`; `MOT` = `.test-dist/modules/vacancies/vacancy-motor.job.test.js` (novo); `SVC` = `.test-dist/modules/vacancies/vacancies.service.test.js`; `NOT` = `.test-dist/modules/notifications/notifications.service.test.js`. Nos testes do motor, os canais usam adapters de teste em `CHANNEL_ADAPTERS` que contam e registram as chamadas: nenhum envio real. N e Z vêm da clínica semeada (`waveSize = 5`, `waveWindowMinutes = 10`); «t0+10» é `tick(now)` com `now = t0 + 10 min`.

## Checks

### S1 - ondas de N a cada Z, sem repetir · 4 arquivos · ~60 KB · ~15k

**C1** - `tick(t0)` com uma vaga `publicada` a 3 dias e 7 inscrições compatíveis chama `enviar` exatamente 5 vezes, para as 5 primeiras inscrições na ordem devolvida por `candidatos(vacancyId, t0)` (`createdAt` crescente), e a vaga ganha exatamente 1 `Transition` `publicada → alertando` com `origin = 'motor'` (S1, AC 1; T2)
Proof: `RUN --test-name-pattern="primeira onda alerta os N primeiros na ordem do matching" MOT`

**C2** - Vaga com 12 inscrições compatíveis, ticks em t0, t0+10, t0+20, t0+30 e t0+40: as inscrições alertadas por tick são exatamente 1–5, 6–10, 11–12, nenhuma e nenhuma; os `Alert` gravados têm `wave` = 1 nas inscrições 1–5, 2 nas 6–10 e 3 nas 11–12 (S1, AC 2; critério do card 5, 5, 2)
Proof: `RUN --test-name-pattern="12 candidatos com N 5 viram ondas de 5, 5 e 2" MOT`

**C3** - Depois da onda de t0, `tick(t0+9)` não chama `candidatos` nem `enviar` para a vaga e não grava `Transition` nela (contagem igual à de antes) (S1, AC 3)
Proof: `RUN --test-name-pattern="dentro da janela Z a vaga em alertando não recebe onda" MOT`

**C4** - A onda de t0+10 sobre a vaga já em `alertando` grava exatamente 1 `Transition` com `fromState = 'alertando'`, `toState = 'alertando'` e `origin = 'motor'` (S1, AC 4; T3)
Proof: `RUN --test-name-pattern="onda seguinte grava alertando para alertando" MOT`

**C5** - No cenário do C2, o `tick(t0+30)` grava exatamente 1 `Transition` `alertando → publicada` com `origin = 'motor'` (T4), e o `tick(t0+40)` sobre a vaga `publicada` com zero candidatos não grava `Transition` nem chama `enviar` (S1, AC 5)
Proof: `RUN --test-name-pattern="fila esgotada volta a publicada e depois para" MOT`

**C6** - `tick(t0)` chamado duas vezes em sequência deixa a vaga com exatamente 1 `Transition` de onda, exatamente 5 `subscriptionId` distintos com `Alert`, e o número de `Alert` igual ao número de pares distintos (vaga, inscrição, canal) (S1, AC 6)
Proof: `RUN --test-name-pattern="tick repetido não repete a onda" MOT`

**C7** - Em 10 rodadas, cada uma com uma vaga `publicada` nova e 12 inscrições, `Promise.all([waves.dispatchDue(t0), waves.dispatchDue(t0)])` (direto no `WavesService`, sem a guarda `running` do job) termina com exatamente 1 `Transition` de onda e exatamente 5 inscrições distintas com `Alert` na vaga, e nenhuma das duas chamadas rejeita (S1, AC 7; porta 3)
Proof: `RUN --test-name-pattern="dois ticks concorrentes gravam uma onda só" MOT`

**C8** - Com a linha da vaga travada por uma transação do teste (`SELECT ... FOR UPDATE` ainda sem commit), `waves.dispatchDue(t0)` resolve antes de o teste liberar a trava, sem chamar `candidatos` nem `enviar` para a vaga e sem gravar `Transition`; depois do commit do teste, o `dispatchDue(t0)` seguinte dispara a onda (porta 3, `SKIP LOCKED`)
Proof: `RUN --test-name-pattern="vaga travada é pulada no tick sem esperar" MOT`

**C9** - Vagas em `reservada`, `realizada`, `expirada` e `cancelada`, cada uma com inscrições compatíveis e horário futuro: `tick(t0)` não chama `candidatos` nem `enviar` para nenhuma delas e não grava `Transition` nelas (S1, AC 8)
Proof: `RUN --test-name-pattern="vaga fora de publicada e alertando não recebe onda" MOT`

**C10** - D2 = (a): no cenário do C2, depois do T4 de t0+30, uma inscrição compatível criada antes do `tick(t0+40)` recebe `enviar` nesse tick (só ela, 1 inscrição), com `Alert.wave = 4`, e a vaga grava `publicada → alertando` com `origin = 'motor'` (Assumption «Vaga publicada depois de esgotar»; Impact, `k = max(Alert.wave) + 1`)
Proof: `RUN --test-name-pattern="inscrição nova depois do esgotamento recebe a onda seguinte" MOT`

**C11** - Cada `enviar` da onda recebe como primeiro argumento o `Patient.id` dono da inscrição (assinatura `enviar(patientId, message, context)` da PR #17, `notifications.service.ts:56`; o motor não passa canal nem contato), `context = { vacancyId, subscriptionId, wave: k }` e a mensagem com `clinicName`, `examName`, `startsAt` e `priceCents` iguais aos da vaga semeada, `vacancyUrl = ${WEB_ORIGIN}/vagas/<vacancyId>`, `preparation` igual a `Exam.preparationCondition` (e `null` numa segunda vaga cujo exame não tem preparo) e `distanceMeters` igual a `haversineMeters(subscription, clinic)` de cada inscrição, com dois pacientes em distâncias diferentes recebendo valores diferentes (Flow, passo 8)
Proof: `RUN --test-name-pattern="mensagem da onda leva os dados da vaga e a distância de cada paciente" MOT`

**C12** - Durante a primeira chamada de `enviar` da onda (adapter de teste que lê o banco por `prisma` fora da transação), a `Transition` da onda já está visível; ou seja, o commit acontece antes do envio (Flow, passo 7; porta 3)
Proof: `RUN --test-name-pattern="a marca da onda é confirmada antes do envio" MOT`

**C35** - Vaga `publicada` com 7 candidatos e N = 5, os pacientes das inscrições 1 e 2 só com canais sem adapter (`alertChannels = ['whatsapp']`, telefone verificado, e o `NotificationsService` de teste sem adapter de WhatsApp: todo outcome deles é `sem_canal`): `tick(t0)` chama `enviar` 7 vezes, na ordem das inscrições 1 a 7; as inscrições 3 a 7 (5 contadas) têm `Alert` `enviado` com `wave = 1`; as 1 e 2 têm cada uma exatamente 1 `Alert` (`whatsapp`, `sem_canal`, `wave = 1`), gravado pelo `NotificationsService`, e não contam para N; `vagaPublicada` recebe só os 5 `User.id` das inscrições 3 a 7; e nenhum arquivo de produção de `vacancies/` escreve em `Alert` (só lê: o dono é o `NotificationsService`) (Flow, passo 8; Assumption «Paciente só com `sem_canal`», HACK-48; acrescentado em 08/11/2026 a pedido do Maestro Motor; ajustado ao HACK-48 em 08/11: antes as 1 e 2 ficavam sem nenhum `Alert`, agora o dono grava o `sem_canal` e o motor continua sem gravar)
Proof: `RUN --test-name-pattern="onda pula paciente só com sem_canal e conta até N" MOT`
Proof: `! grep -rnE '\.alert\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|INSERT INTO "Alert"|UPDATE "Alert"' apps/api/src/modules/vacancies --include='*.ts' --exclude='*.test.ts'`

### S2 - falha isolada · 3 arquivos · ~45 KB · ~11k

**C13** - Com `NotificationsService.enviar` forçado a rejeitar para a inscrição 3 de 5, a onda chama `enviar` 5 vezes (as outras 4 resolvem), a `Transition` da onda continua gravada e o `tick` não rejeita (S2, AC 9)
Proof: `RUN --test-name-pattern="falha no envio de um paciente não para os outros" MOT`

**C14** - Três vagas A, B e C `publicada` com candidatos e `candidatos` forçado a lançar para B: no mesmo `tick`, A e C recebem a onda (5 `enviar` cada, 1 `Transition` cada), B fica sem `Transition` nova, e exatamente 1 linha `warn` ou `error` contém o `vacancyId` de B e não contém o nome, o e-mail nem o telefone dos pacientes semeados nem o `examName` da mensagem (marcadores únicos no teste) (S2, AC 10; Observable, dado pessoal)
Proof: `RUN --test-name-pattern="falha de uma vaga não para a onda das outras e o log não tem dado pessoal" MOT`

**C15** - Para cada uma das 4 etapas do `tick` (`prices`, `expire`, `cancel-pending`, `waves`), forçada a lançar uma de cada vez, as etapas seguintes rodam no mesmo `tick` (efeito observável de cada uma: preço baixado, vaga vencida expirada, pendente cancelado, onda disparada), o `tick` não rejeita, e uma linha registrada contém `etapa <name> falhou`; 4 casos na tabela do teste (S2, AC 11; porta 2)
Proof: `RUN --test-name-pattern="etapa que falha não impede as seguintes" MOT`

**C16** - Três vagas `alertando` vencidas e a expiração da do meio forçada a falhar com erro que não é `ConflictException` (cliente de transação com proxy que rejeita com `Error`): `expireDue(now)` resolve com 2, as outras duas ficam `expirada`, a do meio continua `alertando`, e o `Logger` recebe 1 `warn` com o `vacancyId` dela (S2, AC 12; ressalva 2)
Proof: `RUN --test-name-pattern="erro que não é 409 numa vaga não para o expireDue" SVC`

### S3 - expiração no tick, antes da onda · 1 arquivo · ~3k

**C17** - Vaga `alertando` com `Slot.startsAt = t0+5`, onda 1 em t0 e 7 inscrições restantes; e vaga `publicada` com `startsAt = t0+5` e candidatos: `tick(t0+10)` deixa as duas em `expirada`, cada uma com 1 `Transition` nova `toState = 'expirada'`, sem `Transition` `alertando → publicada` ou `alertando → alertando` gravada nesse tick, sem `Alert` novo e sem `enviar` para elas (S3, AC 13; D3 = a)
Proof: `RUN --test-name-pattern="vaga vencida expira no tick sem receber onda" MOT`

**C18** - Uma vaga `alertando` com `startsAt = t0+5` e 1 `Alert` `pendente`: `tick(t0+10)` deixa a vaga `expirada` e esse `Alert` `cancelado` no mesmo tick (a etapa `expire` roda antes de `cancel-pending`; D3 = a)
Proof: `RUN --test-name-pattern="pendente da vaga que expira é cancelado no mesmo tick" MOT`

### S4 - preço cai pelos degraus · 1 arquivo · ~4k

**C19** - Vaga `publicada` com `fullPriceCents = 72000`, `floorPriceCents = 50000`, degraus −10%/2880 min, −20%/1440 min, −30%/360 min, `currentPriceCents = 72000` e `startsAt = now + 30 h`: `tick(now)` grava `currentPriceCents = 64800` e chama `RealtimeService.vagaPreco` exatamente 1 vez com `{ vagaId, precoCentavos: 64800 }` (espião no módulo de teste); a etapa `prices` chama `PricingService.recalculatePrices` exatamente 1 vez com o mesmo `now` do `tick` (espião), sem segundo cálculo de preço no motor (S4, AC 14; plan, Flow passo 3)
Proof: `RUN --test-name-pattern="preço cai para 64800 a 30 h e o socket avisa" MOT`

**C20** - No cenário do C19, um segundo `tick(now)` mantém 64800 e não chama `vagaPreco`; uma vaga com `currentPriceCents = 50000` gravado e preço calculado 64800 continua 50000 sem evento (RN-27, nunca sobe); uma vaga `reservada` a 30 h com 72000 continua 72000 sem evento (S4, AC 15)
Proof: `RUN --test-name-pattern="preço igual, maior ou de vaga fechada não muda nem emite" MOT`

**C21** - No cenário do C19, com 5 candidatos, a mensagem de cada `enviar` da onda desse mesmo `tick` tem `priceCents = 64800` (S4, AC 16; D3 = a, `prices` antes de `waves`)
Proof: `RUN --test-name-pattern="onda do mesmo tick leva o preço novo" MOT`

### S5 - tempo da demo · 2 arquivos · ~8k · [relógio]

**C22** - **[relógio]** Depois de `clock.advance(25 * 60)`: `publish` e `transition` (sem `tx` e sem relógio explícito) gravam `Transition.occurredAt` entre as leituras de `clock.now()` feitas antes e depois da chamada (portanto ~25 h à frente de `Date.now()`), e `expireDue()` sem argumento expira uma vaga `publicada` com `startsAt = Date.now() + 1 h` e devolve 1 (S5, AC 17; Impact, `vacancies.service.ts`)
Proof: `RUN --test-name-pattern="serviço de vagas usa o relógio da demo" SVC`
Proof: `! grep -n "new Date()" apps/api/src/modules/vacancies/vacancies.service.ts`

**C23** - **[relógio]** Depois de uma transição gravada com o relógio adiantado por `clock.advance(60)`, o relógio volta ao real por `clock.reset()` e a transição seguinte da mesma vaga grava `occurredAt` a ±1 s de `Date.now()`, menor que a anterior; com a anterior a `now + 500 ms` (dentro da tolerância de 1 s), grava anterior + 1 ms (D6 do HACK-29 dentro da época do relógio) (Assumption «Relógio da demo») (mudado na continuação, 08/11, decisão do Gustavo via maestro: `.specs/features/hack-32-continuacao/checks.md`). Antes: «grava anterior + 1 ms quando o relógio recua», o que travava a vaga no futuro.
Proof: `RUN --test-name-pattern="HACK-32 C23 - depois do recuo do relógio occurredAt volta ao agora" SVC`

**C24** - **[relógio]** Duas vagas `publicada` com `currentPriceCents = 72000`: A com `startsAt = Date.now() + 24 h`, B com `startsAt = Date.now() + 48 h` e degraus do C19. `clock.advance(25 * 60)` e `job.tick(clock.now())`: A fica `expirada`; B grava `currentPriceCents` igual a `currentPriceCents()` da `price-engine` para 23 h restantes com os degraus semeados, menor que 72000, e emite 1 `vagaPreco` com esse valor (S5, AC 17)
Proof: `RUN --test-name-pattern="avançar 25 h expira a vencida e baixa o preço das outras" MOT`

**C25** - **[relógio]** Com o deslocamento de 120 min gravado direto na linha `DemoClock` por `prisma` (sem passar pelo `ClockService` da aplicação, como faria outra instância ou o endpoint), disparar o handler do `@Cron` do `VacancyMotorJob` chama `tick` exatamente 1 vez com um `Date` a 120 min ± 1 s de `Date.now()`: o handler chama `clock.refresh()` antes de `clock.now()` (Flow, passo 1; AC 17; `clock.service.ts:14-15` da #17)
Proof: `RUN --test-name-pattern="o cron lê o agora do relógio da demo" MOT`

**C26** - **[relógio]** Onda 1 por `job.tick(clock.now())`; `clock.advance(10)`; o `tick` seguinte dispara a onda 2 (5 `enviar`, `Alert.wave = 2`), e `occurredAt(onda 2) − occurredAt(onda 1) ≥ 10 min` (S5, AC 18)
Proof: `RUN --test-name-pattern="avançar 10 min dispara a onda 2 com occurredAt 10 min depois" MOT`

### S6 - tempo real a quem foi alertado · 1 arquivo · ~3k

**C27** - Uma onda de 5 pacientes, semeados com `Patient.id ≠ Patient.userId`, chama `RealtimeService.vagaPublicada` exatamente 1 vez, com `{ vagaId }` da vaga e uma lista cujo conjunto é igual ao dos 5 `User.id` e que não contém nenhum `Patient.id` (S6, AC 19)
Proof: `RUN --test-name-pattern="vagaPublicada recebe User.id dos pacientes da onda" MOT`

**C28** - Com `vagaPublicada` forçado a lançar: o `tick` não rejeita, a `Transition` da onda e os `Alert` dos 5 pacientes continuam gravados, e 1 linha `warn` ou `error` registra a falha com o `vacancyId` (S6, AC 20)
Proof: `RUN --test-name-pattern="falha do socket não desfaz a onda" MOT`

### S7 - pendentes de vaga fechada · 2 arquivos · ~4k

**C29** - Vagas em `reservada`, `realizada`, `expirada`, `cancelada`, `publicada` e `alertando`, cada uma com 1 `Alert` `pendente`, 1 `enviado` e 1 `falhou`: `cancelPendingOfFinishedVacancies()` devolve 3; os 3 `pendente` das vagas `realizada`, `expirada` e `cancelada` viram `cancelado`; os `enviado` e `falhou` de todas e os `pendente` de `reservada`, `publicada` e `alertando` ficam como estavam (S7, AC 21 e 22; porta 4) (mudado na continuação, 08/11, decisão do Gustavo via maestro: `.specs/features/hack-32-continuacao/checks.md`). Antes: `reservada` cancelava, e o método se chamava `cancelPendingOfClosedVacancies`.
Proof: `RUN --test-name-pattern="HACK-32 C29 - cancela só pendentes de vaga em estado final" NOT`

**C30** - O mesmo cenário do C29 pelo `tick(now)`: o resultado dos 18 `Alert` é o mesmo do C29 (a etapa `cancel-pending` chama o dono, porta 4) (mudado na continuação, 08/11, decisão do Gustavo via maestro: `.specs/features/hack-32-continuacao/checks.md`)
Proof: `RUN --test-name-pattern="C30 - tick cancela pendentes de vaga em estado final" MOT`

### S8 - job registrado e sem sobreposição · 5 arquivos · ~3k

**C31** - A aplicação montada por `createApp` (a de `main.ts` e do `startTestApp`) resolve `app.get(VacancyMotorJob)` e `app.get(WavesService)`; `SchedulerRegistry.getCronJob('vacancy-motor').cronTime.source = '0 * * * * *'`; `getCronJobs()` não tem `example-heartbeat`; o diretório `apps/api/src/examples` não existe (S8, AC 23; porta 1)
Proof: `RUN --test-name-pattern="cron vacancy-motor registrado a cada minuto e sem o exemplo" MOT`
Proof: `test ! -e apps/api/src/examples`

**C32** - **[relógio]** Com o primeiro `tick` preso num adapter de teste que só resolve quando o teste libera, um segundo disparo do handler do cron retorna sem rodar etapa nenhuma (`dispatchDue` chamado 1 vez no total) e o `Logger` recebe exatamente 1 `warn`; depois de liberado o primeiro, um terceiro disparo roda o `tick` (`dispatchDue` chamado 2 vezes no total) (S8, AC 24; porta 1)
Proof: `RUN --test-name-pattern="disparo sobreposto é pulado com warn" MOT`

**C33** - Um `tick` com 2 vagas que recebem onda e 1 vaga que tem o preço baixado, sem falha, não chama `log`, `warn` nem `error` do `Logger` a partir do `VacancyMotorJob` ou do `WavesService` (Observable, «sucesso sem log por vaga»)
Proof: `RUN --test-name-pattern="tick sem falha não registra linha por vaga" MOT`

### Portões do repositório

**C34** - `npm run check` (lint, tipos e testes do monorepo) e `npm run build` terminam com código 0 na raiz do worktree (engineering.md, «antes de entregar»)
Proof: `npm run check`
Proof: `npm run build`

## Coverage

| Set (size)                                                                                   | Member -> proof                                                                                                                                                                                   | Unproven |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| estados da vaga no motor (6)                                                                 | `publicada` C1 · `alertando` C4 · `reservada` C9 · `realizada` C9 · `expirada` C9 · `cancelada` C9                                                                                                | -        |
| ramos da decisão da onda (6)                                                                 | `publicada` com candidatos C1 · `publicada` sem candidatos C5 · `alertando` dentro de Z C3 · `alertando` Z vencido com candidatos C4 · `alertando` Z vencido sem candidatos C5 · linha travada C8 | -        |
| tamanho da onda (3)                                                                          | N cheio C2 · resto menor que N C2 · zero C5                                                                                                                                                       | -        |
| conta para N, por resultado do envio (3)                                                     | outcome diferente de `sem_canal` C2 · só `sem_canal` C35 · `enviar` rejeitado C13                                                                                                                 | -        |
| transições gravadas pelo motor (4)                                                           | T2 C1 · T3 C4 · T4 C5 · T8 C17                                                                                                                                                                    | -        |
| etapas do `tick`, porta 2 (4)                                                                | `prices` C15 · `expire` C15 · `cancel-pending` C15 · `waves` C15                                                                                                                                  | -        |
| ordem das etapas, D3 (3)                                                                     | `prices` antes de `waves` C21 · `expire` antes de `waves` C17 · `expire` antes de `cancel-pending` C18                                                                                            | -        |
| falha isolada (5)                                                                            | envio de um paciente C13 · vaga nas ondas C14 · etapa C15 · vaga no `expireDue` C16 · socket C28                                                                                                  | -        |
| execução sobreposta (2)                                                                      | entre processos ou chamadas concorrentes C7 · mesmo processo C32                                                                                                                                  | -        |
| repetição (2)                                                                                | tick em sequência C6 · tick concorrente C7                                                                                                                                                        | -        |
| preço gravado × calculado (4)                                                                | calculado menor C19 · igual C20 · gravado menor que calculado C20 · vaga fechada C20                                                                                                              | -        |
| campos da mensagem (7)                                                                       | `clinicName` C11 · `examName` C11 · `startsAt` C11 · `priceCents` C11 · `preparation` com e sem valor C11 · `vacancyUrl` C11 · `distanceMeters` C11                                               | -        |
| estados no cancelamento de pendentes (5)                                                     | `reservada` C29 · `expirada` C29 · `cancelada` C29 · `publicada` C29 · `alertando` C29                                                                                                            | -        |
| resultados de `Alert` no cancelamento (3)                                                    | `pendente` C29 · `enviado` C29 · `falhou` C29                                                                                                                                                     | -        |
| trocas de `new Date()` pelo relógio (5)                                                      | `publish` C22 · `transition` C22 · `expireDue` padrão C22 · `nextOccurredAt` C23 · `@Cron` com `refresh()` C25                                                                                    | -        |
| portas de uma via em `Landing` (4)                                                           | porta 1 C31 · porta 2 C15 · porta 3 C7 · porta 4 C29                                                                                                                                              | -        |
| startup config: `VacancyMotorJob` e `WavesService` no `AppModule` (1 montagem compartilhada) | `createApp`, usada por `main.ts` e `startTestApp` C31                                                                                                                                             | -        |
| `Surface` (0 rotas)                                                                          | plan, `Surface` = Nenhum                                                                                                                                                                          | -        |

- Afirmações sobre eventos de socket: C19, C20, C27, C28 - espião sobre o `RealtimeService` real no módulo de teste; a forma do payload é validada pelos schemas do HACK-38 (existente).
- C7 chama o `WavesService` direto para que a prova atravesse a trava do banco, e não a guarda `running` em memória, que o C32 prova à parte.
- C24 calcula o preço esperado de B com `currentPriceCents()` da `price-engine` sobre os degraus semeados; a afirmação é «gravado = calculado e menor que 72000», não um literal derivado à mão.
- Nenhum outro check afirma mais do que o caso que a sua prova exercita.

## Test policy

| Code                                                                                                            | Required proofs                                                                                                                       | Coverage expectation                                                       |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Decide, com banco real (`WavesService`: estado, janela Z, candidatos, trava, número da onda)                    | integração contra o Postgres do worktree pelo `tick`/`dispatchDue`                                                                    | um caso por ramo da decisão da onda: C1, C3, C4, C5, C8, C9                |
| Decide, com banco real (`VacancyMotorJob`: ordem, isolamento por etapa, guarda `running`, `refresh` do relógio) | integração pelo `tick` e pelo handler do cron                                                                                         | C15 tabela sobre as 4 etapas; C25, C32                                     |
| Decide, com banco real (`NotificationsService.cancelPendingOfFinishedVacancies`)                                | na própria camada (C29) **e** pelo consumidor (C30)                                                                                   | os 6 estados × 3 resultados nos dois                                       |
| Repasse (`expireDue`, `candidatos`, `enviar`, `PricingService.recalculatePrices` existentes)                    | nenhuma prova nova além da ressalva 2 (C16), das trocas de relógio (C22, C23) e da chamada pela etapa `prices` (C19, C20 pelo `tick`) | já provados nos HACK-29, 30, 31 e 34 e em `pricing.service.test.ts` da #17 |

Evidence:

- `waves.service.ts` (novo): ramos - trava ausente, estado, `now < último + Z`, zero/algum candidato × estado, N → decide
- `vacancy-motor.job.ts` (novo): lista ordenada de 4 etapas, `try/catch` por etapa, guarda `running`, `updateMany` condicional de preço → decide
- análogo no repo: `vacancies.service.test.ts` do HACK-29 prova `expireDue` e a corrida reserva × expiração contra o Postgres do worktree com `startTestApp`; os testes do motor seguem o mesmo padrão

Cost: 34 provas em 3 arquivos de teste (1 novo). Sem estas linhas, a decisão da onda seria provada só pelo cenário 5, 5, 2 do card, que não passa por trava ocupada nem por estado fechado.

## Swept

- validação: C11 - a mensagem é montada do banco, não de entrada externa; o payload de socket já é validado pelos schemas do HACK-38
- modos de falha: C13, C14, C15, C16, C28
- idempotência: C6, C20 - tick repetido não repete onda nem evento de preço
- autorização: não se aplica - nenhuma rota; o endpoint que move o relógio é do HACK-30 (plan, Out of scope)
- concorrência: C7, C8, C32
- ciclo de vida do dado: não se aplica - nada é apagado nem migrado; `schema.prisma` não muda; `ExamplesModule` é código, removido em C31
- falha de dependência: C13 (canal), C14 (matching), C28 (socket); adapters reais estão fora do card
- transições de estado: C1, C4, C5, C10, C17
- observabilidade: C14, C15, C16, C28, C32, C33

Dimensões da casa: tenant - não se aplica, tarefa agendada sem sessão; dinheiro - C19, C20, C21 (centavos, `Int`, nunca sobe); data - «horário chegou» é `Slot.startsAt ≤ now` em instantes UTC, Z em minutos sobre `occurredAt` (C3, C17, C26); schema - não muda; materializado - não se aplica; fornecedor - adapters de teste em `CHANNEL_ADAPTERS`, mock não prova o fornecedor (cards 4.2–4.4).

## Handoff

- Lidos: `vacancies/` (~48 KB com testes), `notifications/` (~16 KB), `realtime.service.ts` (~3 KB), `examples/` (~2 KB), `testing/` (~7 KB), `app.module.ts` (~1 KB), `schema.prisma` (~15 KB), e da #17 `clock/` (~3 KB) e `pricing.service.ts` (~4 KB) ≈ 99 KB; plano e checks ≈ 50 KB; escritos: `vacancy-motor.job.ts` + `waves.service.ts` (~12 KB), `vacancy-motor.job.test.ts` (~30 KB), acréscimos em `vacancies.service.ts`/teste e `notifications.service.ts`/teste (~10 KB) ≈ 52 KB. Total ≈ 201 KB / 4 ≈ 50k, abaixo do orçamento de 150k - um construtor, sem pergunta.
- Ordem: só depois da PR #17 em `main` → `git merge origin/main` (traz a #16, já em `main`, e a migration `20261108050644_hack_30_34_relogio_demo_e_preferencias_de_canal` da #17), conferir o `DATABASE_URL` do `.env` (`hack_32` em 54329), `npm run db:migrate -w @hackathon/api`; o primeiro commit leva `plan.md` e `checks.md`.
- Mecanismo: um construtor (dentro do orçamento, sem pergunta).
- **Boundary:** C1-C35 fechados no último commit do card (base `9c99e08`, com merge de `origin/main` em `c0abcf3` trazendo as PRs #18 e #19, e em `add044a` trazendo as #21 e #22 do HACK-37 e HACK-48); `npm run check` e `npm run build` verdes; suíte da API em série com 247 testes em 45,8 s (`duration_ms`; 229 em 51,9 s antes do merge do HACK-48, 205 em 40,3 s antes do primeiro merge, 172 em 33,9 s antes do card).
- **Settled mid-build:** `--test-concurrency=1` aceito pelo Maestro Motor apesar de 2,66x (12,7 s → 33,9 s antes do card); exemplo de preço corrigido para 64800 (C19 a C21, AC 14); porta 5 (`VACANCY_MOTOR_ENABLED`, achada no build, em `Landing`); `transition` ganhou o `now` opcional para a onda gravar o instante do tick (Flow, Impact); banco `hack_32` criado no container `hack-29-postgres-1` (54329), porque o `docker compose up` deste worktree disputaria a porta; teste extra «C7 (extra)» prova a trava na onda seguinte (`alertando → alertando`), porque o C7 sozinho passa sem a trava (o update condicional do HACK-29 já separa a primeira onda); conferido removendo o `FOR UPDATE SKIP LOCKED`: o extra e o C8 ficam vermelhos. C35 acrescentado a pedido do Maestro Motor (a onda só conta para N quem teve outcome diferente de `sem_canal`); conferido trocando o filtro por «conta todos»: o C35 fica vermelho. Ajustado ao HACK-48 (PR #22, `21c8b39`) em 08/11: `sem_adapter` virou `sem_canal`, o `NotificationsService` passou a gravar `Alert` `sem_canal` para todo canal ativado, e o C35 deixou de afirmar «1 e 2 sem `Alert`» para afirmar «1 e 2 com 1 `Alert` `sem_canal` do dono, sem contar para N», mais o grep de que o motor não escreve em `Alert`.
- **Abandoned:** montar o motor pela DI da app nos testes: o `CHANNEL_ADAPTERS` é `useValue: []` e não há `@nestjs/testing`; os testes montam `WavesService` e `VacancyMotorJob` pelo construtor com os serviços reais da app, como o `notifications.service.test.ts` faz com o `NotificationsService`.
