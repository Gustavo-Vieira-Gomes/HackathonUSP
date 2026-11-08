# HACK-18 · Conectar Google Agenda por OAuth - verification

**Verdict**: FAIL
**Profile**: standard
**Diff range**: a3b6bf4..06ccd72
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier) - Verificador HACK-18, sessão nova, sem contexto do Construtor

Resumo: as 46 provas rodaram verdes em `06ccd72` e as 5 falhas injetadas foram mortas. O FAIL vem de uma linha do `Test policy` não atendida: dois ramos de decisão do callback (`google-calendar-connection.service.ts:152-155`) não têm nenhum caso que os alcance, então uma implementação errada deles passaria na suíte. A correção é pequena (dois casos no `HTTP`). Os pontos de atenção do Maestro (tokens, `code` e state fora de log, corpo e `Location`; AAD por clínica; state de uso único sob corrida; isolamento entre clínicas; 503 sem `GOOGLE_*`) estão provados e resistiram à injeção de falhas.

Ambiente: Postgres do worktree em `127.0.0.1:54318` (container `hack-18-postgres-1`, conferido no `docker ps`; `DATABASE_URL` efetivo lido do `apps/api/.env`, banco `hack_18`). Next 3180 e Nest 3181 do portal não foram tocados (conferido depois do smoke). Smoke rodou sob o lock pesado, em portas livres, com os builds `dist/` e `.next/` que são de HEAD (nenhum fonte mais novo que `dist/main.js` nem que `.next/BUILD_ID`).

## Binding sources

Perfil `standard`: o passo 1 (comparar com fontes vinculantes) é do perfil `ui` e não roda. Lidos como contexto: `plan.md`, `checks.md` e `docs/product/marketplace-vagas-imagem.md` (RN-05, F3). Nenhuma contradição entre plano e checks encontrada ao derivar o `Coverage`.

## Checks

Comandos rodados (uma invocação por alvo):

- API: `VACANCY_MOTOR_ENABLED=false node --env-file-if-exists=.env --test --test-concurrency=1 --test-name-pattern="^H18-C" ENV BOOT HTTP SVC CRY GOC` - 37 testes, 37 passed, 0 failed; cada `H18-C<n>` aparece individualmente como `✔`.
- Web: `npx tsx --conditions=react-server --test --test-name-pattern="^H18-C" WCB WVM WACT` - 8 passed, 0 failed.
- Smoke: `npm run smoke` exit 0 (asserções `H18-C6`, `H18-C30`, `H18-C32` em `scripts/smoke.mjs:250-281`).
- C46 shell: `test -z "$(grep -rl ... "from 'googleapis'" apps/api/src | grep -v google-oauth.client.ts$)"` exit 0; `npm ls googleapis -w @hackathon/api` exit 0 (`googleapis@189.0.0`).

Uma primeira rodada minha com os 6 arquivos da API em paralelo (sem `--test-concurrency=1`) falhou o C9 (`4 !== 3`); o C9 conta todas as linhas `CalendarConnection` do banco e outro arquivo criava linhas ao mesmo tempo. Nas condições do repo (`--test-concurrency=1`, como no `npm run test`) passou, e isolado passou 3 de 3. Ver ressalva R1.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | 1 ou 3 das 4 `GOOGLE_*` recusam o boot citando só nomes | ENV `^H18-C1 ` exit 0 | `apps/api/src/config/env.test.ts:169` - `assert.match(error.message, new RegExp(name))`; `:172` - `assert.equal(error.message.includes(secret), false)`; `:195` - `assert.equal(cases, 8)` | PASS |
| C2 | chave de 31/33 bytes ou não base64 recusada; 32 passa | ENV `^H18-C2 ` exit 0 | `apps/api/src/config/env.test.ts:204` - `assertRejectedNaming(..., ['GOOGLE_TOKEN_ENCRYPTION_KEY'], [key, ...])`; `:213` - `encryptionKey.length, 32` | PASS |
| C3 | sem `GOOGLE_*` indisponível; com as 4 disponível | ENV `^H18-C3 ` exit 0 | `apps/api/src/config/env.test.ts:217` - `googleCalendarConfig(loadEnv({...valid})), null`; `:219` vazias `null`; `:222` `clientId` | PASS |
| C4 | `main.js` com só o client id sai antes de escutar sem vazar | BOOT `^H18-C4 ` exit 0 | `apps/api/src/config/boot.test.ts:94` - `result.code, 1`; `:95` - `/GOOGLE_OAUTH_CLIENT_SECRET/`; `:96` - `output.includes(clientId), false`; `:97` - `listening, false` | PASS |
| C5 | sem `GOOGLE_*` `/health` 200 e 5 rotas 503 `GOOGLE_CALENDAR_UNAVAILABLE`, Google 0 | HTTP `^H18-C5 ` exit 0 | `apps/api/src/modules/google-calendar/google-calendar.http.test.ts:288` - `response.status, 503`; `:290` - `json.code, 'GOOGLE_CALENDAR_UNAVAILABLE'`; `:294` - `spy.mock.callCount(), 0` | PASS |
| C6 | 503 faz a tela dizer indisponível, sem botão nem lista | WVM `^H18-C6 ` exit 0 + smoke | `apps/web/core/modules/clinic-calendar/clinic-calendar-view.test.ts:45` - `load, { kind: 'unavailable' }`; `:51` - `showConnect, false`; `:52` - `calendars, undefined`; `scripts/smoke.mjs:256` e `:260` | PASS |
| C7 | URL com offline, consent, escopos exatos, state, redirect | GOC `^H18-C7 ` exit 0 | `apps/api/src/modules/google-calendar/google-oauth.client.test.ts:151` - host `accounts.google.com`; `:153-159` - `access_type`, `prompt`, `include_granted_scopes`, `response_type`, `client_id`, `redirect_uri`, `state`; `:160` - `scope` igual aos 2 escopos | PASS |
| C8 | connect 200; state 43 base64url; só SHA-256, sessão, 10 min; 2º connect troca o hash | HTTP `^H18-C8 ` exit 0 | `google-calendar.http.test.ts:309` - `/^[A-Za-z0-9_-]{43}$/`; `:313` - `oauthStateHash, hash`; `:318` - `oauthStateSessionId, session.id`; `:320` validade; `:328` hash trocado | PASS |
| C9 | sem cookie 401, paciente 403 nas 5 rotas, 0 Google, 0 linhas | HTTP `^H18-C9 ` exit 0 (série) | `google-calendar.http.test.ts:340` - `anonymous.status, 401`; `:342` - `asPatient.status, 403`; `:344` - chamadas 0; `:345` - `count(), before` | PASS |
| C10 | callback válido: 1 troca, `AWAITING_CALENDAR`, tokens v1 que decifram, state nulo, 302 `awaiting_calendar` | HTTP `^H18-C10 ` exit 0 | `google-calendar.http.test.ts:354` - `location` igual a `{WEB_ORIGIN}/clinica/agenda?google=awaiting_calendar`; `:359` - `exchangeCalls, [code]`; `:362-371` status, formato e decifra; `:373-375` state nulo | PASS |
| C11 | 5 states inválidos: `invalid_state`, 0 troca, nada muda | HTTP `^H18-C11 ` exit 0 | `google-calendar.http.test.ts:431` - `result, 'invalid_state', label`; `:432` - `exchangeCalls.length, 0`; `:434-437` linha igual (casos em `:401-423`) | PASS |
| C12 | state da A com sessão da B: `invalid_state`, A e B como estavam | HTTP `^H18-C12 ` exit 0 | `google-calendar.http.test.ts:450` - `'invalid_state'`; `:451` - 0 trocas; `:452` - `snapshot(a), beforeA`; `:454` - `row(b), null` | PASS |
| C13 | dois callbacks simultâneos: 1 troca, um `awaiting_calendar` e um `invalid_state` | HTTP `^H18-C13 ` exit 0 | `google-calendar.http.test.ts:488` - `results, ['awaiting_calendar', 'invalid_state']`; `:489` - `exchangeCalls.length, 1`; `:491` status | PASS |
| C14 | `access_denied`: `denied`, 0 troca, state zerado, conexão intacta | HTTP `^H18-C14 ` exit 0 | `google-calendar.http.test.ts:508` - `'denied'`; `:509` - 0 trocas; `:510` - snapshot igual com state nulo; `:514` - antes `CONNECTED` | PASS |
| C15 | troca sem refresh: `no_refresh_token`, nenhum token muda | HTTP `^H18-C15 ` exit 0 | `google-calendar.http.test.ts:528` - `'no_refresh_token'`; `:529` - snapshot igual ao anterior | PASS |
| C16 | troca falha ou expira: `google_unavailable`, nada gravado | HTTP `^H18-C16 ` exit 0 | `google-calendar.http.test.ts:545` - `'google_unavailable', kind`; `:547` - `now, {...before, oauthStateHash: null}`; `:548` - `refreshToken, null` | PASS |
| C17 | reconectar mantém a conexão até o callback dar certo | HTTP `^H18-C17 ` exit 0 | `google-calendar.http.test.ts:559` - `mid.status, 'CONNECTED'`; `:564` agenda mantida; `:571` - `'AWAITING_CALENDAR'`; `:580` - refresh novo | PASS |
| C18 | callback do Next: repassa e devolve o 302; sem sessão login; 502; 504 | WCB `^H18-C18 ` exit 0 | `apps/web/core/modules/clinic-calendar/google-calendar-callback.test.ts:37` - `location, NEST_LOCATION`; `:39-40` url e cookie repassados; `:46` login; `:50` API não chamada; `:54` 502; `:61` 504 | PASS |
| C19 | serviço de conectar: URL, indisponível, fora do contrato é erro | WACT `^H18-C19 ` exit 0 | `apps/web/core/modules/clinic-calendar/clinic-calendar-actions.test.ts:31` - `{ kind: 'redirect', url }`; `:41` - `unavailable`; `:47` - `error` | PASS |
| C20 | calendars: só owner, `id/name/primary`, primária primeiro | HTTP `^H18-C20 ` exit 0 | `google-calendar.http.test.ts:606` - 200; `:608` - `body.calendars, expected`; `:610` - chaves `['id','name','primary']` | PASS |
| C21 | sem linha ou `EXPIRED`: 409 `CALENDAR_NOT_AUTHORIZED`, 0 Google | HTTP `^H18-C21 ` exit 0 | `google-calendar.http.test.ts:631` - 409; `:633` - code; `:635` - linha igual; `:637` - `listCalls, 0` | PASS |
| C22 | PUT com agenda própria: 200 `connected` e linha `CONNECTED` | HTTP `^H18-C22 ` exit 0 | `google-calendar.http.test.ts:649` - `'connected'`; `:650` - `calendarName`; `:651` - `connectedAt`; `:653-655` linha | PASS |
| C23 | 422 `CALENDAR_NOT_AVAILABLE` e 422 `VALIDATION_FAILED` com `fields`; linha igual | HTTP `^H18-C23 ` exit 0 | `google-calendar.http.test.ts:670-672` - 422 e code; `:683-686` - 422, `VALIDATION_FAILED`, `fields ['calendarId']`; `:688` - 0 Google; `:689` - snapshot igual | PASS |
| C24 | credencial recusada: 409 e `EXPIRED` sem tokens | HTTP `^H18-C24 ` exit 0 | `google-calendar.http.test.ts:712` - 409; `:714` code; `:716` - `'EXPIRED'`; `:717-718` tokens nulos | PASS |
| C25 | falha 502 `GOOGLE_UNAVAILABLE`, timeout 504 `GOOGLE_TIMEOUT`, linha igual | HTTP `^H18-C25 ` exit 0 | `google-calendar.http.test.ts:741` - status; `:743` - code; `:744` - snapshot igual | PASS |
| C26 | GET de status nos 4 status, no contrato | HTTP `^H18-C26 ` exit 0 | `google-calendar.http.test.ts:757` - `{ status: 'disconnected' }`; `:760` - `awaiting_calendar`; `:764-766` connected com nome e data; `:772` - `expired` | PASS |
| C27 | a tela por status | WVM `^H18-C27 ` exit 0 | `clinic-calendar-view.test.ts:68-70` conectada; `:76-78` desconectada e botão; `:84-88` expirada e botão; `:94-96` lista e «Usar esta agenda» | PASS |
| C28 | lista vazia: aviso e sem «Usar esta agenda» | WVM `^H18-C28 ` exit 0 | `clinic-calendar-view.test.ts:104` - `emptyText` igual à cópia; `:108` - `calendars, undefined` | PASS |
| C29 | API fora, 500, fora do contrato: erro de carga, nenhum status | WVM `^H18-C29 ` exit 0 | `clinic-calendar-view.test.ts:134` - `notice` igual à cópia de erro; `:139` - `statusText, undefined`; `:142` | PASS |
| C30 | 4 alertas distintos; sucesso, desconhecido e ausente sem alerta | WVM `^H18-C30 ` exit 0 + smoke | `clinic-calendar-view.test.ts:159-160` alerta não vazio e igual ao mapa; `:162` - `Set(alerts).size, 4`; `:164` sem alerta; `scripts/smoke.mjs:269` `role="alert"` | PASS |
| C31 | serviço de escolher: PUT, 200 no contrato é sucesso, erros com code | WACT `^H18-C31 ` exit 0 | `clinic-calendar-actions.test.ts:63-66` - método, url, cookie e corpo; `:77` - `{ ok: false, code }` para 409/422/422/502/504; `:84` 200 fora do contrato é erro | PASS |
| C32 | sem cookie `/clinica/agenda` vai ao login | smoke exit 0 | `scripts/smoke.mjs:276` - status em `[303, 307, 308]`; `:281` - `location` termina em `/clinica/login` | PASS |
| C33 | nenhum corpo nem `Location` com token, `code` ou state | HTTP `^H18-C33 ` exit 0 | `google-calendar.http.test.ts:855` - `text.includes(secret), false` (tokens e codes); `:863` - state ausente fora do connect; `:867` - `seen.length, 9` | PASS |
| C34 | colunas cruas só em v1, sem texto puro | HTTP `^H18-C34 ` exit 0 | `google-calendar.http.test.ts:878-879` - `TOKEN_FORMAT`; `:883-884` - `all.includes(token), false` | PASS |
| C35 | AES-256-GCM com AAD: ida e volta, IV aleatório, 5 recusas | CRY `^H18-C35 ` exit 0 | `apps/api/src/modules/google-calendar/token-cipher.test.ts:26` - decifra; `:27` - IV difere; `:37-39` - `TokenCipherError` sem o segredo nas 5 tentativas (`:30-34`) | PASS |
| C36 | logs das falhas sem token, `code`, state, Bearer, Authorization | HTTP `^H18-C36 ` exit 0 | `google-calendar.http.test.ts:930-932` - kind e status no log; `:939` - `text.includes(secret), false`; `:941` - `/Bearer|Authorization/i` ausente | PASS |
| C37 | `GaxiosError` real traduzido sem token nem corpo, 5 casos | GOC `^H18-C37 ` exit 0 | `google-oauth.client.test.ts:193` - `instanceof GoogleApiError`; `:194` - sem `config`/`response`; `:195` - `kind`; `:198` - sem segredo | PASS |
| C38 | `getAuthorizedCalendar` devolve cliente e agenda com tokens decifrados | SVC `^H18-C38 ` exit 0 | `apps/api/src/modules/google-calendar/google-calendar-connection.service.test.ts:127` - `calendarId`; `:128` - cliente; `:130` - credenciais decifradas | PASS |
| C39 | 3 chamadas reais expiram entre 10 e 12 s | GOC `^H18-C39 ` exit 0 | `google-oauth.client.test.ts:209` - `GOOGLE_TIMEOUT_MS, 10_000`; `:227` - `ms >= 10_000 && ms < 12_000`; `:228` tipo timeout | PASS |
| C40 | sem linha, `AWAITING_CALENDAR`, `EXPIRED` lançam `CalendarNotConnectedError` sem Google | SVC `^H18-C40 ` exit 0 | `google-calendar-connection.service.test.ts:145` - `assert.rejects(..., CalendarNotConnectedError)`; `:150` - `calls, 0` | PASS |
| C41 | `onTokens` grava novo access token cifrado e validade; refresh igual | SVC `^H18-C41 ` exit 0 | `google-calendar-connection.service.test.ts:167-168` - v1 que decifra para o novo; `:172` - validade; `:173` - refresh igual | PASS |
| C42 | `markCredentialsRejected`: `EXPIRED`, tokens nulos, agenda mantida, idempotente | SVC `^H18-C42 ` exit 0 | `google-calendar-connection.service.test.ts:183-187`; `:192` - segunda chamada deixa a linha idêntica | PASS |
| C43 | classificação: `invalid_grant` e 401 true; 7 outros false | GOC `^H18-C43 ` exit 0 | `google-oauth.client.test.ts:255` - `table.length, 9`; `:257` - `isCredentialsRejectedError(error), expected` | PASS |
| C44 | revogação: classifica, marca e GET responde `expired` | HTTP `^H18-C44 ` exit 0 | `google-calendar.http.test.ts:973` - `true`; `:976` - `status, 'expired'` | PASS |
| C45 | `listConnectedClinicIds` só a `CONNECTED` | SVC `^H18-C45 ` exit 0 | `google-calendar-connection.service.test.ts:210` - `ids, [connected]` | PASS |
| C46 | enum, unicidade, cascade, módulo exporta porta 3, `googleapis` só no adaptador e no lock | SVC `^H18-C46 ` exit 0 + 2 comandos de shell exit 0 | `google-calendar-connection.service.test.ts:222` - enum com os 4 valores; `:229` - `P2002`; `:234` - cascade 0 linhas; `:249` - serviço resolvido no módulo consumidor; `:255` - métodos da porta 3 | PASS |

## Coverage

Recomputado da autoridade de cada conjunto: rotas e status do `Surface` do plano; resultados `google=` do contrato (`packages/contracts/src/google-calendar.ts`); ramos de decisão do próprio código para a linha do `Test policy`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| `GET /api/clinic/google-calendar` (4) | plan `Surface` | 200 C26 · 401 C9 · 403 C9 · 503 C5 | - |
| `POST .../connect` (4) | plan `Surface` | 200 C8 · 401 C9 · 403 C9 · 503 C5 | - |
| `GET .../callback` Nest (4) | plan `Surface` | 302 C10 · 401 C9 · 403 C9 · 503 C5 | - |
| `GET .../calendars` (7) | plan `Surface` | 200 C20 · 401/403 C9 · 409 C21 · 502 C25 · 503 C5 · 504 C25 | - |
| `PUT .../calendar` (8) | plan `Surface` | 200 C22 · 401/403 C9 · 409 C21 · 422 C23 · 502 C25 · 503 C5 · 504 C25 | - |
| `GET /api/google-calendar/callback` Next (3) | plan `Surface` | 302 C18 · 502 C18 · 504 C18 | - |
| resultados `google=` (5) | contrato `googleCalendarCallbackResultSchema` | `awaiting_calendar` C10 · `denied` C14 · `invalid_state` C11 · `no_refresh_token` C15 · `google_unavailable` C16 | - |
| entradas do callback com state válido que levam a um resultado (6) | código `google-calendar-connection.service.ts:151-164` | state inválido C11 · `error=access_denied` C14 · troca falha/timeout C16 · sem refresh C15 · sucesso C10 · `error` diferente de `access_denied` e state válido sem `code` | `error` ≠ `access_denied` (`:153`) · sem `code` (`:155`) |
| state recusado (6) | plan AC 7/8 | ausente, desconhecido, vencido, consumido, outra sessão C11 · outra clínica C12 | - |
| `code` de erro do Nest (7) | plan `Surface` | todos em C5, C9, C21, C23, C25 | - |
| status no `GET` (4) e transições (6) | enum do schema e plan | C26 · C10, C17, C22, C24, C42 | - |
| estados da tela (6) e `?google=` (7) | plan AC 19-24 | C6, C27-C30 | - |
| `GOOGLE_*` (4), bordas da chave (4) | `env.ts` | C1, C2 | - |
| erros do Google classificados (5), adulteração (5) | adaptador e cifra | C43, C39 · C35 | - |
| porta 3 (4), timeouts (3), portas de `Landing` (7) | plan `Surface`/`Landing` | C38, C40, C42, C43, C45 · C39 · C7, C34, C35, C46 | - |
| startup config (2 montagens) | `main.ts` e `startTestApp` | `main.js` C4 (`boot.test.ts:94`) · `createApp` via `startTestApp` C5 | - |

## Test policy rows

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decide, alcançado pelo HTTP | `google-calendar-connection.service.ts` | `HTTP` contra Postgres, um caso por ramo | não atendida - os ramos `:153` (`error` ≠ `access_denied` vira `google_unavailable`) e `:155` (state válido sem `code` vira `google_unavailable`) não têm caso; busca `rg "error:" google-calendar.http.test.ts` só acha `access_denied` (`:506`, `:831`) e nenhum callback com state válido sem `code`. Mutante plausível sem assassino: `query.error ? 'denied' : ...` |
| Decide, consumido pelo HACK-19 sem HTTP | porta 3 do serviço | `SVC` | sim - C38, C40, C41, C42, C45 |
| Decide, isolado do HTTP pelo falso | `google-oauth.client.ts` | `GOC` sem Google real | sim - C7, C37 (5), C39 (3), C43 (9) |
| Decide, pura | `token-cipher.ts`, `env.ts`, `clinic-calendar-view.ts` | na própria camada | sim - C1-C3, C35, C27-C30 |
| Instrumentação | módulo, controller, route handler, Server Actions | pelo consumidor; `WCB`/`WACT` | sim - C18, C19, C31 |

## Faults injected

Em worktree descartável (`git worktree add --detach` no scratchpad, `node_modules` por symlink); porcelain do worktree real igual antes e depois (vazio), worktree removido.

| Mutation | Location | Killed |
| --- | --- | --- |
| M1: consumo do state sem conferir a sessão (removido `oauthStateSessionId: sessionId` do `where`) | `apps/api/src/modules/google-calendar/google-calendar-connection.service.ts:142` | yes - C11 «outra sessão»: `'awaiting_calendar' !== 'invalid_state'` |
| M2: AAD retirada da cifra e da decifra (sem `setAAD` nas duas pontas) | `apps/api/src/modules/google-calendar/token-cipher.ts:23` e `:56` | yes - C35 «Missing expected exception» na decifra com o `clinicId` de outra clínica |
| M3: objeto de erro do Google passado ao `logger.warn` | `apps/api/src/modules/google-calendar/google-calendar-connection.service.ts:354` | yes - C36 «log vazou segredo» |
| M4: consumo do state não atômico (`findFirst` + `update` incondicional, com 50 ms entre eles) | `apps/api/src/modules/google-calendar/google-calendar-connection.service.ts:138` | yes - C13 estourou o tempo (as duas trocas ficam presas no portão, desenho do teste); rodado com `--test-timeout=40000` |
| M5: 401 deixa de ser credencial recusada | `apps/api/src/modules/google-calendar/google-oauth.client.ts:112` | yes - C43 caso `401`: `actual: false` |

Teto de 5 atingido; superfícies do web (`WVM`, `WCB`, `WACT`) não receberam mutação nesta rodada.

## Findings

Bloqueia (FAIL):

1. `Test policy` «um caso por ramo» não atendida - `apps/api/src/modules/google-calendar/google-calendar-connection.service.ts:153` e `:155`. Cenário: o Google volta com `error=server_error` (ou `temporarily_unavailable`) e state válido; o código responde `google=google_unavailable`, mas nenhum teste afirma isso, e trocar para `denied` ou para `awaiting_calendar` passaria na suíte. Idem para callback com state válido e sem `code`. Correção: dois casos no `HTTP` (por exemplo dentro do C16, que já afirma `google_unavailable` sem gravar token) afirmando `google=google_unavailable`, 0 trocas e conexão intacta.

Ressalvas (não bloqueiam):

- R1. `google-calendar.http.test.ts:337` e `:345` - o C9 compara `calendarConnection.count()` global; com arquivos de teste em paralelo (sem `--test-concurrency=1`) falha por linhas de outro arquivo. Contar só as linhas das contas criadas no teste tira a dependência da ordem.
- R2. `google-calendar.http.test.ts:461-481` - o C13 detecta a regressão por travamento; o `npm run test` da API não passa `--test-timeout`, então a regressão travaria a suíte em vez de falhar. Um `timeout` no próprio `test(...)` resolve.
- R3. `apps/web/core/modules/clinic-calendar/clinic-calendar-view.ts:91-112` - em `awaiting_calendar` com lista vazia ou erro ao listar, a tela não oferece «Conectar Google Agenda»; a clínica que autorizou com a conta errada fica sem saída pela tela. Nenhum AC exige o botão aí (AC 22 só pede o aviso); fica para decisão do Maestro.
- R4. C27 afirma «uma opção de rádio com label por agenda»; a prova está no modelo de visão (`clinic-calendar-view.test.ts:94`), não no HTML. O JSX (`screens/clinic-calendar-screen.tsx:60-75`) faz `input type="radio"` + `label htmlFor`, mas nenhuma asserção alcança essa estrutura (lacuna de nível, menor).
- R5. C46 diz «chama os quatro nomes da porta 3»; a prova confere o tipo de três métodos e de `isCredentialsRejectedError` e chama só `listConnectedClinicIds` (`google-calendar-connection.service.test.ts:255-260`). Os outros são chamados em C38-C45, então o comportamento está provado; é imprecisão da redação do check.
- R6. `google-oauth.client.ts:176` - `listOwnedCalendars` monta o cliente com `onTokens` vazio; um access token renovado durante a listagem não é gravado (só custa uma renovação a mais depois). Sem efeito em segurança.

## Gate

API: `node --test --test-concurrency=1 --test-name-pattern="^H18-C"` nos 6 arquivos - 37 passed, 0 failed. Web: `tsx --test --test-name-pattern="^H18-C"` nos 3 arquivos - 8 passed, 0 failed. `npm run smoke` exit 0. Comandos de shell do C46 exit 0. Checks: 46/46 com prova verde e evidência localizada; veredito FAIL pela linha do `Test policy`.
