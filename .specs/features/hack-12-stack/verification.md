# HACK-12 · stack verification

**Verdict**: PASS
**Profile**: light
**Diff range**: ad7ff67..1a2e804
**Round**: 1 - full
**Verifier**: independent agent (sessão nova do Verificador HACK-12, sob o Maestro Fundação; author != verifier)

Perfil `light`, como aprovado no `checks.md`: provas rodadas em `HEAD`, cada teste nomeado mostrado como existente e executado, uma asserção localizada por check, `Swept existing` relido. **Nenhuma falha injetada** e `Coverage` lido (não recalculado) — o perfil não pede esses passos.

Ambiente: `DATABASE_URL` efetivo de `apps/api/.env` lido antes das provas → `127.0.0.1:54312/hack_12` (container `hack-12-postgres-1`). `git status --porcelain` limpo antes e depois. `npm run check`, `build` e `smoke` rodados sob o lock pesado.

## Binding sources

Nenhum - perfil `light` e o plano não marca fonte visual obrigatória; a única tela tocada é a linha de sessão da home.

## Checks

Execuções que cobrem as provas:

- API: `npm test -w @hackathon/api > log 2>&1` (prisma generate + `tsc` para `.test-dist` + `node --test` em todos os `*.test.js`) → exit 0, `ℹ tests 30 · pass 30 · fail 0`; cada `C<n> - …` aparece individualmente como `✔`.
- Web: `npx tsx --conditions=react-server --test --test-name-pattern="^C(29|30|31|32|33) " core/shared/services/api-proxy.test.ts core/shared/services/session.service.test.ts` → exit 0, 5/5 `✔`.
- Gates: `npm run check` (exit 1, só `format:check` dos 4 docs pré-existentes; lint, typecheck e testes 30 + 5 + 2 verdes), `npm run build` exit 0, `npm run smoke` exit 0 (`Smoke HTTP passou: saúde Next/Nest, cadastro, login e sessão pelo Next, fallback e 502 com API desligada.`).

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | Postgres do worktree em 54312, banco `hack_12` | as 2 provas do check, exit 0 / 0 | `docker-compose.yml` (porta `${POSTGRES_PORT}`); saída `0.0.0.0:54312->5432/tcp`; `select current_database()` = `hack_12` | PASS |
| C2 | tabelas exatas, `role` NOT NULL sem default, 2 índices únicos | `db:migrate` (já em dia) + 3 provas psql, exit 0 / 0 / 0 | `apps/api/prisma/migrations/20261108025102_init_auth/migration.sql:7` - `"role" TEXT NOT NULL,` | PASS |
| C3 | `.env.example` só com placeholders e hosts locais | prova do check, exit 0 | `apps/api/.env.example` - `BETTER_AUTH_SECRET=troque-por-um-segredo-local-de-32-caracteres`; `.env.example` - `POSTGRES_PORT=5432` | PASS |
| C4 | 4 variáveis × ausente/vazia citam o nome sem valor; `main.js` sai 1 sem abrir porta | suíte API, `✔ C4` (env) e `✔ C4` (boot) | `apps/api/src/config/env.test.ts:24` - `assert.match(error.message, new RegExp(...name...))`, `:39` - `assert.equal(cases, 8)`; `apps/api/src/config/boot.test.ts:62` - `assert.equal(result.code, 1, …)`, `:71` - `assert.equal(result.listening, false)` | PASS |
| C5 | segredo de 31 recusa, 32 aceita | suíte API, `✔ C5` ×2 | `apps/api/src/config/env.test.ts:52` - `assert.equal(env.BETTER_AUTH_SECRET.length, 32)`; `apps/api/src/config/boot.test.ts:76` - `assert.equal(result.code, 1, …)` | PASS |
| C6 | cadastro clínica 200, role clinica, cookie HttpOnly | suíte API, `✔ C6` | `apps/api/src/auth/sign-up.test.ts:31` - `assert.equal(response.status, 200, …)`, `:33` - `assert.equal(body.user.role, role)`, `:39` - `assert.match(cookie, /;\s*HttpOnly/i)` | PASS |
| C7 | cadastro paciente 200, role paciente, cookie HttpOnly | suíte API, `✔ C7` | mesmo helper, `apps/api/src/auth/sign-up.test.ts:33` e `:39` | PASS |
| C8 | `role` ou campo extra → 400, contagem 0 (4 casos) | suíte API, `✔ C8` | `apps/api/src/auth/sign-up.test.ts:64` - `assert.equal(response.status, 400, …)`, `:65` - `assert.equal(await countByEmail(email), 0)`, `:69` - `assert.equal(cases, 4)` | PASS |
| C9 | e-mail repetido → 422, contagem 1 (3 pares) | suíte API, `✔ C9` | `apps/api/src/auth/sign-up.test.ts:91` - `assert.equal(repeated.status, 422, …)`, `:92` - `assert.equal(await countByEmail(email), 1)` | PASS |
| C10 | senha de 7 → 400 nas 2 rotas, sem usuário | suíte API, `✔ C10` | `apps/api/src/auth/sign-up.test.ts:106` - `assert.equal(response.status, 400, role)`, `:107` - contagem 0 | PASS |
| C11 | `/api/auth/sign-up/email` → 404, sem usuário | suíte API, `✔ C11` | `apps/api/src/auth/sign-up.test.ts:120` - `assert.equal(response.status, 404)`, `:121` - contagem 0 | PASS |
| C12 | `signUpEmail` sem contexto não cria; insert sem `role` falha | suíte API, `✔ C12` | `apps/api/src/auth/sign-up.test.ts:128` - `assert.rejects(auth.api.signUpEmail(…))`, `:133` - contagem 0, `:136` - `assert.rejects($executeRaw INSERT … sem role)`; único NOT NULL sem default omitido é `role` (`migration.sql:7`) | PASS |
| C13 | sign-in 200 com cookie HttpOnly | suíte API, `✔ C13` | `apps/api/src/auth/session.test.ts:36` - `assert.equal(response.status, 200)`, `:41` - `assert.match(cookie, /;\s*HttpOnly/i)` | PASS |
| C14 | senha errada e e-mail inexistente → 401 com corpo idêntico | suíte API, `✔ C14` | `apps/api/src/auth/session.test.ts:59-61` - status 401 ×2 e `assert.deepEqual(await wrongPassword.json(), await unknownEmail.json())` | PASS |
| C15 | sign-out 200 e `/api/me` passa a 401 | suíte API, `✔ C15` | `apps/api/src/auth/session.test.ts:74` - `assert.equal(response.status, 200)`, `:75` - `assert.equal((await me(cookie)).status, 401)` | PASS |
| C16 | update-user com role → 400 `FIELD_NOT_ALLOWED`, papel mantido | suíte API, `✔ C16` | `apps/api/src/auth/session.test.ts:87` - status 400, `:89` - `assert.equal(body.code, 'FIELD_NOT_ALLOWED')`, `:91` - `assert.equal(user.role, 'paciente')` | PASS |
| C17 | Origin fora de `WEB_ORIGIN` → 403 sem cookie | suíte API, `✔ C17` | `apps/api/src/auth/session.test.ts:103` - `assert.equal(response.status, 403)`, `:104` - nenhum `session_token=` no `set-cookie` | PASS |
| C18 | `Secure` só com https | suíte API, `✔ C18` | `apps/api/src/auth/session.test.ts:124` - `assert.doesNotMatch(…, /;\s*Secure/i)`, `:136` - `assert.match(…, /;\s*Secure/i)` | PASS |
| C19 | `/api/me` 200 com chaves exatas `email,id,name,role` | suíte API, `✔ C19` | `apps/api/src/auth/session.test.ts:145` - status 200, `:147` - `assert.deepEqual(Object.keys(body).sort(), ['email', 'id', 'name', 'role'])` | PASS |
| C20 | 401 sem cookie / adulterado / encerrado, sem `email`/`id` | suíte API, `✔ C20` | `apps/api/src/auth/session.test.ts:179` - `assert.equal(response.status, 401, label)`, `:181-182` - corpo sem `"email"` e `"id"` | PASS |
| C21 | health 200 `{status:"ok",service:"api"}`, missing 404 | suíte API, `✔ C21` | `apps/api/src/app.test.ts:12-13` - status 200 e `deepEqual` do corpo, `:17` - 404 | PASS |
| C22 | guard global: rota sem `@AllowAnonymous` 401/200 | suíte API, `✔ C22` | `apps/api/src/auth/auth-guard.test.ts:41` - `assert.equal(… .status, 401)`, `:60` - `assert.equal(response.status, 200)` | PASS |
| C23 | `getSession` devolve id/role; null sem cookie/adulterado | suíte API, `✔ C23` | `apps/api/src/auth/session.test.ts:193-194` - `user.id` e `user.role`, `:202` - `assert.equal(await t.sessions.getSession({}), null)` | PASS |
| C24 | generate 200 com token; 401 sem cookie | suíte API, `✔ C24` | `apps/api/src/auth/one-time-token.test.ts:39` - `assert.ok(token.length > 0)`, `:40` - `assert.equal((await generate()).status, 401)` | PASS |
| C25 | verify devolve sessão de quem gerou | suíte API, `✔ C25` | `apps/api/src/auth/one-time-token.test.ts:50-51` - `user.id` e `user.role` iguais | PASS |
| C26 | segunda verificação → null | suíte API, `✔ C26` | `apps/api/src/auth/one-time-token.test.ts:59` - `assert.equal(await t.sessions.verifyOneTimeToken(token), null)` | PASS |
| C27 | verify por HTTP 404, token segue válido no serviço | suíte API, `✔ C27` | `apps/api/src/auth/one-time-token.test.ts:71` - `assert.equal(response.status, 404)`, `:73` - `session?.user.id` = `account.id` | PASS |
| C28 | token não guardado em texto puro | suíte API, `✔ C28` | `apps/api/src/auth/one-time-token.test.ts:84` - `assert.equal(rows.length, 0)`, `:88` - `assert.ok(stored > 0, …)` | PASS |
| C29 | repasse das 3 rotas preserva método/corpo/cookie e status/corpo/set-cookie | web `✔ C29` + smoke exit 0 | `apps/web/core/shared/services/api-proxy.test.ts:82-89` (importa os Route Handlers reais, `:3-4`); `scripts/smoke.mjs:120` e `:127` - 200 pelo Next | PASS |
| C30 | `/api/sign-up/admin` no Next → 404 sem chamar o Nest | web `✔ C30` | `apps/web/core/shared/services/api-proxy.test.ts:98` - `assert.equal(response.status, 404)`, `:99` - `assert.equal(api.requests.length, before)` | PASS |
| C31 | sessão server-only chama `/api/me` com cookie; home mostra e-mail | web `✔ C31` + smoke exit 0 | `apps/web/core/shared/services/session.service.test.ts:23` - `assert.deepEqual(result, user)`, `:26` - url `/api/me`; `scripts/smoke.mjs:133` | PASS |
| C32 | 504 timeout, 502 recusa, padrão 10000 ms | web `✔ C32` + smoke exit 0 | `apps/web/core/shared/services/api-proxy.test.ts:103` - `API_PROXY_TIMEOUT_MS === 10_000`, `:112` - 504, `:122` - 502; `scripts/smoke.mjs:145` - 502 com API desligada | PASS |
| C33 | 401/conexão/timeout/corpo inválido → null sem lançar | web `✔ C33` | `apps/web/core/shared/services/session.service.test.ts:56` - `assert.equal(await call, null, label)` | PASS |
| C34 | job `0 * * * * *`, log sem dado de usuário | suíte API, `✔ C34` | `apps/api/src/examples/examples.test.ts:18` - `assert.equal(job.cronTime.source, '0 * * * * *')`, `:26` - `assert.doesNotMatch(line, …)` - regex de `@`, `cookie`, `session_token` e `id`` | PASS |
| C35 | socket.io `ping` → `pong` | suíte API, `✔ C35` | `apps/api/src/examples/examples.test.ts:59` - `assert.equal(event, 'pong')` | PASS |
| C36 | `check`, `build`, `smoke` verdes | `check` exit 1 só por `format:check` dos 4 docs pré-existentes (decisão do Maestro registrada no `## Handoff` do `checks.md`); `build` exit 0; `smoke` exit 0 | log: `[warn]` só em `.specs/features/marketplace-vagas-imagem/brainstorm.md`, `.specs/features/prontuario-pessoal/brainstorm.md`, `docs/product/fluxo-de-trabalho.md`, `docs/product/marketplace-vagas-imagem.md`; os 4 reprovam em `git show ad7ff67:<f>` passado ao `npx prettier --check --stdin-filepath` (exit 1 nos 4) e não estão no diff; lint, typecheck e testes verdes | PASS (com a exceção decidida) |
| C37 | `npm test -w @hackathon/api` roda subpastas (C6 de `auth/`, C4 de `config/`) | prova do check, exit 0 | log contém `ℹ fail 0`, `✔ C6 - …`, `✔ C4 - …`; script em `apps/api/package.json` (`.test-dist/**/*.test.js`) | PASS |
| C38 | CI com Postgres + healthcheck e `db:deploy` antes de check/build/smoke | prova `awk`, exit 0 | `.github/workflows/ci.yml:11` - `postgres:`, `:20` - `--health-cmd`, `:38` - `db:deploy`, `:39-41` - check, build, smoke | PASS |

## Coverage

Lido, não recalculado (perfil `light`). Todas as 26 linhas do `checks.md` apontam para checks com teste executado acima; nenhum membro marcado `Unproven`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| todas as linhas do `checks.md` (26) | lido do `checks.md` (light) | cada check citado tem `✔` na execução e asserção localizada | - |

## Swept existing

- concorrência → C2: o índice único em `User.email` existe (prova C2 terceira consulta = 2 índices únicos, `User(email)` e `Session(token)`). Confirmado.
- ciclo de vida do dado (expiração de sessão/token nos padrões da biblioteca): política aprovada, nada a conferir no código.

## Segurança (atenção pedida pelo Maestro)

- Papel nunca definível pelo cliente: `signUpBodySchema` é `z.strictObject` (`packages/contracts/src/index.ts`), o hook em `apps/api/src/auth/auth.config.ts:31` lê o papel só do `AsyncLocalStorage` da rota e devolve `false` sem ele; `role` com `input: false` sem default. Provado por C8, C12, C16.
- `/sign-up/email` 404 (C11) e `/one-time-token/verify` 404 por HTTP (C27) via `disabledPaths`; verify só pelo `AuthSessionService` no servidor.
- Guard global da biblioteca (C22); rotas públicas com `@AllowAnonymous()` explícito.
- OTT de uso único (C26) e guardado com hash (C28).
- Logs: só o log do job (`Job example-heartbeat executado`) e o `console.error` da validação de env, que cita nomes e não valores (C4). Nenhum token/cookie logado no diff.
- Segredos: `.env`, `apps/api/.env` e `apps/web/.env.local` ignorados (`.gitignore:6-7`); só `*.env.example` versionados, com placeholders; nenhum `.env` em commits de `ad7ff67..HEAD`; CI gera `BETTER_AUTH_SECRET` por execução.

## Desvios declarados pelo Construtor

- `tsconfig` `nodenext`: dentro da porta 7 (`node16` ou `nodenext`). Não fere critério.
- Repasse encaminha `origin`, `user-agent`, `x-forwarded-for`, `accept`: necessário para C17 (`trustedOrigins`) e não fere C29. Observação abaixo sobre `x-forwarded-for`.
- Timeout de 5 s da sessão no Server Component: o plano só fixa os 10 s do repasse (C32); C33 cobre o timeout. Não fere critério.
- Home mostra `Sessão ativa: <email>`: é o que C31 exige provar pelo smoke.
- Comandos de prova de C3 e C37 corrigidos: afirmações inalteradas; reexecutei as versões novas e as duas exigem o que a afirmação diz (C37 agora exige `ℹ fail 0`).

## Observações (não reprovam)

1. `x-forwarded-for` vem do cliente e é repassado como está; se o rate limit do Better Auth usar esse cabeçalho, um cliente pode trocar de "IP" à vontade em ambiente onde a borda não o sobrescreve. Para o HACK-14/deploy.
2. O placeholder de `BETTER_AUTH_SECRET` no `.env.example` tem 43 caracteres e passa na validação de 32: quem copia o exemplo sobe com segredo conhecido. Aceitável em dev local.
3. O CI roda `npm run check`; enquanto os 4 docs não forem formatados na `main`, o job reprova.

## Gate

- `npm test -w @hackathon/api` - 30 passed, 0 failed
- web `tsx --test` (C29-C33) - 5 passed, 0 failed
- `npm run check` - lint/typecheck/testes (30 + 5 + 2) verdes; `format:check` exit 1 só nos 4 docs pré-existentes
- `npm run build` - exit 0
- `npm run smoke` - exit 0
