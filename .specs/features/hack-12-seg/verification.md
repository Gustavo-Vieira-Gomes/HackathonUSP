# HACK-12 seg verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 26d6e45..0a250dd
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier) - Verificador HACK-12 seg, recruit novo e diferente do Construtor

## Binding sources

Nenhuma fonte obrigatória: mudança curta, sem `plan.md`, sem tela (perfil `light`, sem passo de `ui`).

| Source                                              | Opened                 | Contradiction | Uncovered |
| --------------------------------------------------- | ---------------------- | ------------- | --------- |
| `.specs/features/hack-12-seg/checks.md` `## Intent` | yes - lido no worktree | none          | -         |

## Checks

Provas rodadas no HEAD `0a250dd`, depois de `npx tsc -p tsconfig.json --outDir .test-dist` (exit 0), Postgres `127.0.0.1:54314/hack_12_seg`.

| Check | Claim                                                                                                                  | Proof run                                                                                                                | Evidence                                                                                                                                                                                                                                                               | Result |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| C1    | urlencoded + `Origin: evil.example` → 403, sem cookie, 0 `User`, nas 2 rotas                                           | `node --test --test-name-pattern (C1, C2, C3, C6) .test-dist/auth/sign-up-protection.test.js` exit 0, `✔ C1 - …`         | `apps/api/src/auth/sign-up-protection.test.ts:47` `assert.equal(response.status, 403, role)` · `:48` `getSetCookie(), []` · `:49` `countByEmail(...) , 0`                                                                                                              | PASS   |
| C2    | JSON com Origin ausente/evil/`null`/outra porta → 403 `ORIGIN_NOT_ALLOWED`, sem cookie, 0 `User` (8 casos)             | mesma invocação, `✔ C2 - …`                                                                                              | `sign-up-protection.test.ts:72` `status, 403` · `:74` `body.code, 'ORIGIN_NOT_ALLOWED'` · `:76` `countByEmail, 0` · `:80` `cases, 8`                                                                                                                                   | PASS   |
| C3    | Origin certo + urlencoded/text/multipart/ausente → 415, 0 `User`; json+charset → 200 (10 casos)                        | mesma invocação, `✔ C3 - …`                                                                                              | `sign-up-protection.test.ts:99` `status, 415` · `:100` `countByEmail, 0` · `:108` `accepted.status, 200` · `:113` `cases, 10`                                                                                                                                          | PASS   |
| C4    | regressão 200/HttpOnly, 400, 422 nas 2 rotas                                                                           | `node --test --test-name-pattern (C6 a C10) .test-dist/auth/sign-up.test.js` exit 0, 5 ✔                                 | `apps/api/src/auth/sign-up.test.ts:31` `status, 200` · `:39` `/;\s*HttpOnly/i` · `:64` `status, 400` · `:91` `repeated.status, 422` · `:106` `status, 400`                                                                                                             | PASS   |
| C5    | pelo Next: urlencoded hostil → 403 e e-mail não vira `User`; cadastro JSON segue 200 com cookie                        | `npm run smoke` exit 0 ("Smoke HTTP passou")                                                                             | `scripts/smoke.mjs:150` `hostile.status, 403` · `:151` `getSetCookie(), []` · `:160` login hostil 401 · `:120` C29 `signUp.status, 200`. Banco conferido à parte: ataque real pelo Next (3140) com contagem `User` = 0 por e-mail                                      | PASS   |
| C6    | N=30 primeiras não recebem 429, a 31ª → 429 sem `User`; contagem por rota                                              | `sign-up-protection.test.js` `✔ C6 - …`                                                                                  | `sign-up-protection.test.ts:131` `status, 200` (×limit) · `:135` `blocked.status, 429` · `:136` `countByEmail, 0` · `:138` `/clinica` 200                                                                                                                              | PASS   |
| C7    | nada em `apps/api/src` lê `NODE_ENV`; C1–C3, C6 passam com `NODE_ENV=production`                                       | `! grep -rn "NODE_ENV" apps/api/src` exit 0 · `NODE_ENV=production node --test … sign-up-protection.test.js` exit 0, 4 ✔ | `apps/api/src/auth/sign-up.controller.ts:30` `@UseGuards(SignUpRequestGuard, ThrottlerGuard)` incondicional · `apps/api/src/auth/auth.module.ts:26` `ThrottlerModule.forRoot([SIGN_UP_RATE_LIMIT])` sem condição; `node_modules/@nestjs/throttler/dist` sem `NODE_ENV` | PASS   |
| C8    | `loadEnv` recusa placeholder e marcadores (caixa alta/baixa), mensagem cita o nome sem o valor; aleatório de 44 aceito | `node --test --test-name-pattern="^C8 " .test-dist/config/env.test.js` exit 0                                            | `apps/api/src/config/env.test.ts:71` `match(error.message, /\bBETTER_AUTH_SECRET\b/)` · `:72` `includes(secret), false` · `:79` `random.length, 44` · `:80` aceito                                                                                                     | PASS   |
| C9    | `main.js` com placeholder sai 1, cita o nome, não vaza, porta fechada                                                  | `node --test --test-name-pattern="^C9 " .test-dist/config/boot.test.js` exit 0                                           | `apps/api/src/config/boot.test.ts:85` `result.code, 1` · `:86` `/BETTER_AUTH_SECRET/` · `:87` `includes(placeholder), false` · `:88` `listening, false`                                                                                                                | PASS   |
| C10   | `.env.example` com `BETTER_AUTH_SECRET=` vazio e comentário `openssl rand`                                             | `grep -qx 'BETTER_AUTH_SECRET=' … && grep -q 'openssl rand' …` exit 0                                                    | `apps/api/.env.example:7` `BETTER_AUTH_SECRET=` · `:6` `openssl rand -base64 32`                                                                                                                                                                                       | PASS   |

## Coverage

Perfil `light`: join lido, não recomputado. Conferido que cada membro citado tem teste que roda e afirma o valor.

| Set (size)                             | Recomputed from                                                       | Member -> proof                                   | Unproven |
| -------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- | -------- |
| rotas protegidas (2)                   | `sign-up.controller.ts` (guards no controller inteiro)                | paciente/clinica C1 C2 C3 (laços em `roles`) · C6 | -        |
| `Origin` recusado (5)                  | checks.md                                                             | C1 urlencoded · C2 tabela de 4                    | -        |
| `content-type` (5)                     | checks.md                                                             | C3 tabela de 4 + aceito                           | -        |
| `POST /api/sign-up/:role` statuses (6) | checks.md                                                             | 200 400 422 C4 · 403 C1 C2 · 415 C3 · 429 C6      | -        |
| marcadores de segredo (4)              | `env.ts:13` regex `troque` ou `change-?me`, sem caixa                 | C8 tabela de 7 · C9                               | -        |
| startup config (2 assemblies)          | `main.ts:12` `createApp({ env })` · `testing/test-app.ts` `createApp` | C5/C9 por `dist/main.js` · C1/C6 pelo harness     | -        |

## Faults injected

Não roda no perfil `light` - no faults injected (perfil declarado no `checks.md`).

## Contornos tentados (servidores reais: API 3141, Next 3140, banco conferido por e-mail)

| Tentativa                                                                                                                                    | API 3141                                 | Next 3140     | `User` criado     |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------- | ----------------- |
| urlencoded + `Origin: http://evil.example` (paciente, clinica)                                                                               | 403                                      | 403           | 0                 |
| urlencoded/JSON sem Origin, só `Referer` legítimo                                                                                            | 403                                      | 403           | 0                 |
| Origin maiúsculo, barra final, subdomínio, `…:3140.evil.example`, `localhost:3140`, `https://`                                               | 403                                      | 403           | 0                 |
| dois cabeçalhos Origin (evil, depois o legítimo)                                                                                             | 403                                      | 403           | 0                 |
| `application/jsonx`, `application/json , text/plain`, `text/plain;application/json`, `application/vnd.api+json`, `text/plain` com corpo JSON | 415                                      | 415           | 0                 |
| `application/json` + corpo urlencoded, Origin certo                                                                                          | 400                                      | 400           | 0                 |
| `application/json` + Origin evil (fetch cross-site)                                                                                          | 403                                      | 403           | 0                 |
| legítimos: `application/json; x="a;b"` e `APPLICATION/JSON`                                                                                  | 200 + cookie                             | 200 + cookie  | 1 cada (esperado) |
| `/api/auth/sign-up/email` (desabilitado)                                                                                                     | 404                                      | 404           | 0                 |
| `/api/auth/sign-in/email` JSON/urlencoded com Origin evil                                                                                    | 403                                      | 403           | 0                 |
| `/api/auth/sign-out` com cookie de sessão e Origin evil                                                                                      | 403 (sessão segue válida, `/api/me` 200) | -             | -                 |
| 32 cadastros JSON válidos pelo Next em `/clinica`                                                                                            | -                                        | 30×200, 2×429 | 30                |

Usuários criados pela verificação (35, todos `verif-*@teste.local`) apagados depois.

## Gate

Lock pesado obtido e liberado. `npm run check` exit 0 (api 48/48, demais 5/5 e 5/5, lint, typecheck, format) · `npm run build` exit 0 · `npm run smoke` exit 0. Logs da API e do Next sem `secret`, `troque` ou `password`; o diff não adiciona log.

## Observações (não mudam o veredito)

- `## Out of scope` diz que `/api/auth/*` "já têm origem e rate limit próprios": a origem sim (403 acima), mas o rate limit do Better Auth está desligado fora de produção (`better-auth/dist/context/create-context.mjs:172` `enabled: options.rateLimit?.enabled ?? isProduction`). Isso não afeta o limite novo, que não depende de `NODE_ENV` (C7).
- C5 no smoke prova "não virou `User`" por login 401, não por contagem no banco; a contagem foi feita à parte nesta verificação.
- Pelo Next o balde do throttler é o IP do Next (R2 → HACK-14), confirmado: 30 cadastros de clientes diferentes esgotariam a cota comum.
