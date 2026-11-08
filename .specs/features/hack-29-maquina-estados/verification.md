# HACK-29 · máquina de estados da vaga - verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: b1bc276..5016ac2
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier) - Verificador HACK-29, recruit distinto do Construtor, sob o Maestro Motor

Ambiente: Postgres do worktree (`127.0.0.1:54329/hack_29`, conferido no `.env` da API antes de conectar), `prisma migrate status` = schema em dia (3 migrations). Provas rodadas em `apps/api` depois de `prisma generate` + `tsc --outDir .test-dist`, numa invocação só para os dois arquivos (`node --env-file-if-exists=.env --test TAB SVC`): 23 testes, 23 passaram, cada um listado pelo nome (`C1` … `C23`) no log.

## Binding sources

Perfil `standard`: o passo de fontes vinculantes é do perfil `ui`. Não há tela nem rota neste card (plan, `Surface` = nenhuma). Sem fonte vinculante a abrir.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `publicada → realizada` lança 409 com a mensagem literal | `RUN SVC` (lote) - `✔ C1` | `vacancies.service.test.ts:162-165` - `assertConflict(service.transition(vacancy.id, 'realizada', …), 'Transição de vaga inválida: publicada → realizada')`; helper `:123-125` - `error instanceof ConflictException`, `getStatus() === 409`, `error.message === message` | PASS |
| C2 | recusa não muda estado nem contagem | lote - `✔ C2` | `vacancies.service.test.ts:171` - `deepEqual(before, { state: 'publicada', transitions: 1 })`; `:175` - `deepEqual(await snapshot(vacancy.id), before)` | PASS |
| C3 | `canTransition` aceita 13 de 36 pares, lista literal | `RUN TAB` (lote) - `✔ C3` | `vacancy-transitions.test.ts:37` - `assert.equal(canTransition(from, to), expected)` sobre lista literal `:11-25`; `:42-43` - `yes === 13`, `no === 23` | PASS |
| C4 | serviço + banco seguem a tabela nos 36 pares | lote - `✔ C4` | `vacancies.service.test.ts:187-191` - `result.state === to` e `snapshot = { state: to, transitions: 1 }`; `:195-200` - 409 e `snapshot = { state: from, transitions: 0 }`; `:205-206` - `accepted === 13`, `refused === 23` | PASS |
| C5 | 3 terminais × 6 destinos = 18 recusas | lote - `✔ C5` | `vacancies.service.test.ts:214-218` - `assertConflict(...)` e `snapshot = { state: from, transitions: 0 }`; `:222` - `refused === 18` | PASS |
| C6 | uuid inexistente → 404 `Vaga não encontrada`, 0 `Transition` | lote - `✔ C6` | `vacancies.service.test.ts:230-232` - `NotFoundException`, `getStatus() === 404`, `message === 'Vaga não encontrada'`; `:236` - `transition.count({ vacancyId: id }) === 0` | PASS |
| C7 | motivo `''`, `'   '`, 501 recusado em `transition` e `publish`; 500 aceito | lote - `✔ C7` | `vacancies.service.test.ts:243-250` - `assert.rejects(...)` + `snapshot === before`; `:253-259` - `assert.rejects(publish…)` + `vacancy.count({ slotId }) === 0`; `:268,272` - `state === 'alertando'`, `last.reason === 'x'.repeat(500)` | PASS |
| C8 | `createApp` resolve `VacanciesService` | lote - `✔ C8` | `vacancies.service.test.ts:65,67` - `createApp(...)`, `app.get(VacanciesService)`; `:276` - `instanceof VacanciesService`; montagem lida em `app.module.ts:24` (`VacanciesModule` no `imports`) e `vacancies.module.ts:9` (`exports: [VacanciesService]`) | PASS |
| C9 | `publish` grava `publicada` + 1ª `Transition` com os 6 campos | lote - `✔ C9` | `vacancies.service.test.ts:291` - `stored.state === 'publicada'`; `:295` - `length === 1`; `:298-303` - `vacancyId`, `reservationId null`, `fromState null`, `toState 'publicada'`, `origin 'clinica'`, `reason 'r'` | PASS |
| C10 | transição sem `tx` grava from/to/origem/motivo/occurredAt | lote - `✔ C10` | `vacancies.service.test.ts:313` - `result.state === 'alertando'`; `:317` - 1 linha com `fromState 'publicada'`; `:320-323` - `toState`, `origin 'motor'`, `reason 'onda 1'`, `occurredAt instanceof Date` | PASS |
| C11 | `timeline` do cenário do card: 5 linhas em ordem | lote - `✔ C11` | `vacancies.service.test.ts:341-350` - `deepEqual(map(from→to), ['null→publicada', 'publicada→alertando', 'alertando→alertando', 'alertando→reservada', 'reservada→realizada'])` | PASS |
| C12 | `occurredAt` estritamente crescente (≥ 1 ms) com relógio parado | lote - `✔ C12` | `vacancies.service.test.ts:355,358` - `mock.timers` congela `Date`, `Date.now() === Date.now()`; `:363` - `length === 5`; `:367` - `current - previous >= 1` | PASS |
| C13 | falha no `transition.create` depois do `updateMany` real desfaz tudo | lote - `✔ C13` | `vacancies.service.test.ts:437-440` - `rejects(/falha forçada/)`; `:445` - `updated === 1` (update real rodou); `:446` - `snapshot === before` | PASS |
| C14 | rollback do chamador desfaz estado e transição | lote - `✔ C14` | `vacancies.service.test.ts:452-458` - `rejects(/rollback do chamador/)`; `:459-460` - `snapshot === before`, `before.state === 'publicada'` | PASS |
| C15 | com `tx` do chamador, entra no commit dele, sem `$transaction` interna | lote - `✔ C15` | `vacancies.service.test.ts:470` - `spy.calls() === 1` (só a do teste); `:474-477` - `snapshot = { state: 'alertando', transitions: 2 }` | PASS |
| C16 | corrida reserva × expiração, 20 rodadas: 1 vence, 1 recebe 409, 1 `Transition` | lote - `✔ C16` | `vacancies.service.test.ts:493-494` - `fulfilled.length === 1`, `rejected.length === 1`; `:496-500` - `ConflictException`, `getStatus() === 409`; `:501-505` - `transition.count === 1` | PASS |
| C17 | `expireDue` expira `publicada` e `alertando` vencidas, devolve 2 | lote - `✔ C17` | `vacancies.service.test.ts:517` - `expireDue(now) === 2`; `:519` - `state === 'expirada'`; `:523-525` - 1 linha, `origin 'motor'`, `toState 'expirada'` | PASS |
| C18 | futura e outros 4 estados intactos | lote - `✔ C18` | `vacancies.service.test.ts:541` - `expireDue(now) === 0`; `:542-545` - `snapshots === before` para as 5 vagas (futura `now + 1 min` em `:534`) | PASS |
| C19 | segunda chamada com o mesmo `now` devolve 0 | lote - `✔ C19` | `vacancies.service.test.ts:555` - `=== 1`; `:558` - `=== 0`; `:559` - `snapshot === afterFirst` | PASS |
| C20 | `Reservation` iguais campo a campo antes e depois | lote - `✔ C20` | `vacancies.service.test.ts:593` - `before.length === 2`; `:595` - `deepEqual(await read(), before)` | PASS |
| C21 | expirar antes do horário → 409, nada muda (`publicada` e `alertando`) | lote - `✔ C21` | `vacancies.service.test.ts:602-603` - `assertConflict(transition(…, 'expirada'))`, `snapshot === before`, horário `now + 1 h` em `:600` | PASS |
| C22 | transação concorrente trava A; `expireDue` devolve 2, B e C expiram, A fica `reservada` sem expiração | lote - `✔ C22` | `vacancies.service.test.ts:636` - `await run === 2` (não rejeita); `:637-639` - B, C `expirada`, A `reservada`; `:640-645` - `count({ vacancyId: a.id, toState: 'expirada' }) === 0` | PASS |
| C23 | 1 `warn` com id, estados e origem, sem o motivo | lote - `✔ C23` | `vacancies.service.test.ts:658` - `callCount() === 1`; `:661-662` - texto contém `vacancy.id`, `publicada`, `realizada`, `clinica`; `:664` - `!JSON.stringify(args).includes(marker)` | PASS |

Todas as provas resolvem a testes que o diff criou (`vacancies.service.test.ts` e `vacancy-transitions.test.ts` são arquivos novos em `a7abaa2`/`f6b88bc`) e ficaram verdes em `5016ac2`.

## Coverage

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| pares `VacancyState` × `VacancyState` (36) | enum `VacancyState` do schema (6 valores; `vacancy-transitions.test.ts:29` afirma `length === 6`) × «Tabela de transições» do plano | C3 e C4 iteram os 36 pares com a lista literal (`vacancy-transitions.test.ts:11-25`, `vacancies.service.test.ts:30-44`) | - |
| arestas aceitas T1-T12 (12, 13 pares) | «Tabela de transições» do plano (fonte da regra, não o código) | T1 C9 · T2-T12 C3 e C4 (os 13 pares conferidos um a um contra a tabela do plano; o código em `vacancy-transitions.ts:13-17` bate) | - |
| estados terminais (3) | plano, «Terminais» | `realizada` · `expirada` · `cancelada` C5 (`:211`) | - |
| erros da API do serviço (3) | plano, porta 6 + AC 6; ramos `throw` de `vacancies.service.ts` (`:119`, `:177`, `:183`) | 409 C1 · 404 C6 · motivo inválido C7 | - |
| limites de `reason` (4) | AC 6 | `''` · `'   '` · 501 C7 (`:242`) · 500 C7 (`:262`) | - |
| métodos públicos (4) | `vacancies.service.ts` (`publish :35`, `transition :60`, `expireDue :73`, `timeline :99`) | C9 · C10 · C17 · C11 | - |
| parâmetro `tx` (3) | `run()` em `vacancies.service.ts:190-195` | sem `tx` C10 · confirmada C15 · desfeita C14 | - |
| estados no `expireDue` (6) | enum `VacancyState` | `publicada`, `alertando` C17 · `reservada`, `realizada`, `expirada`, `cancelada` C18 | - |
| guarda de horário T8 (2) | `vacancies.service.ts:123` | vencido C17 · futuro C21 | - |
| portas de uma via (6) | plano, `Landing` 1-6 | 1 C8 · 2 C9/C10/C15 · 3 C3 · 4 C16 · 5 C12 · 6 C1/C6 | - |
| montagem `VacanciesModule` (1) | `app.module.ts:24` lido; `createApp` em `app.ts` é a montagem de `main.ts` e do `startTestApp` | C8 | - |

Varredura por conjuntos sem linha: o plano não tem `Surface` com rotas (nenhuma rota) e nenhuma enumeração extra em `Relations`; o enum `TransitionOrigin` não é decidido por este card (só repassado), sem conjunto a provar.

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decide, alcançado através de um limite | `vacancy-transitions.ts` | própria camada C3 · limite C4, os 36 pares nos dois | yes |
| Decide, com banco real | `vacancies.service.ts` | integração contra o Postgres do worktree, um caso por ramo: C1, C2, C6, C7, C13-C22 | yes |
| Montagem que não decide | `vacancies.module.ts`, `app.module.ts` | um no limite: C8 pela app de `createApp` | yes |

## Faults injected

Worktree descartável (`git worktree add --detach` no scratchpad, `node_modules` por symlink), porcelain do worktree real conferida igual (vazia) depois do descarte.

| Mutation | Location | Killed |
| --- | --- | --- |
| tirou `reservada` das saídas de `publicada` (T5) | `apps/api/src/modules/vacancies/vacancy-transitions.ts:13` | yes - C3 e C4 falharam |
| update sem a condição de estado (`where: { id }`) | `apps/api/src/modules/vacancies/vacancies.service.ts:129` | yes - C16 falhou |
| limite `>=` → `>` no `occurredAt` monotônico | `apps/api/src/modules/vacancies/vacancies.service.ts:161` | yes - C12 falhou (C11 continuou verde, esperado) |
| `expireDue` relança todo erro (sem isolar o 409) | `apps/api/src/modules/vacancies/vacancies.service.ts:92` | yes - C22 falhou |
| `run()` ignora o `tx` do chamador e abre transação própria | `apps/api/src/modules/vacancies/vacancies.service.ts:194` | yes - C14 e C15 falharam |

## Desvios declarados pelo Construtor

| Desvio | Veredito |
| --- | --- |
| motivo inválido → `BadRequestException` 400; `reason` gravado com `trim` | aceito. A porta 6 só fixa 409 (par proibido) e 404; o AC 6 pede «recusar antes de gravar» sem status, e 400 é a semântica certa para entrada inválida (não é conflito com o estado). O `trim` é normalização razoável, mas o AC 7/8 diz «o `reason` recebido» e nenhum teste prova o `trim` (`vacancies.service.ts:181,187`): ressalva de precisão, não bloqueio |
| `npm ci` com lock | aceito: `git diff b1bc276..HEAD -- package-lock.json` vazio, nenhuma dependência nova |
| prettier em plan/checks | aceito: `prettier --check` limpo em `.specs/features/hack-29-maquina-estados/` e nos arquivos de código; mudança só de formatação |
| testes de `expireDue` na era 1981-1985 com drenagem antes | aceito: `era(k) = 1980 + k` (`vacancies.service.test.ts:133`), cada teste usa uma era e drena antes; nenhum outro teste da API usa `expireDue` nem datas dos anos 80 (grep); suíte da API rodada duas vezes seguidas, 107/107 nas duas |
| C13/C15 trocam `$transaction` à mão e restauram no `finally` | aceito: `restore()` em `finally` (`:441-443`, `:471-473`); a mutação do `run()` mostrou que C14/C15 mordem |

## Ressalvas (não bloqueiam)

1. Precisão do C7: os `assert.rejects` de `vacancies.service.test.ts:243-245` e `:253-258` não conferem tipo nem status do erro; qualquer rejeição passa. O check também não fixa o 400. Morre por estado/contagem, mas o formato do erro de motivo inválido não está provado.
2. `trim` do `reason` sem prova (`vacancies.service.ts:181,187`) e diverge da letra do AC 7/8 («o `reason` recebido»).
3. C22 depende de `sleep(300)` (`vacancies.service.test.ts:632`) para o `findMany` do `expireDue` ler A antes do commit concorrente; se ler depois, A já não está na lista e o teste passa sem exercitar o 409. Nesta rodada exercitou (a mutação do catch foi morta), mas é sensível a máquina lenta.
4. `expireDue` relança erro que não seja 409 (`vacancies.service.ts:92`) e para o lote; o AC 18 só cobre 409. Fica para o HACK-32 decidir (ex.: vaga apagada entre o `findMany` e o `apply` daria 404 e pararia o cron).

## Gate

`node --env-file-if-exists=.env --test .test-dist/modules/vacancies/vacancy-transitions.test.js .test-dist/modules/vacancies/vacancies.service.test.js` - 23 passed, 0 failed
`npm run test` (apps/api, sob o lock pesado, 2 vezes) - 107 passed, 0 failed nas duas
`eslint src/modules/vacancies src/app.module.ts` - exit 0 · `prettier --check` - exit 0
