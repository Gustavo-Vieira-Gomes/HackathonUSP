# HACK-12 · stack checks

Profile: light
Plan: `.specs/features/hack-12-stack/plan.md`

38 checks em 7 fatias · 7 portas de uma via · 1 pergunta aberta, nenhuma bloqueia

Convenções das provas:

- API: cada teste começa pelo id do check (`C6 - …`). Comando-base, de `apps/api`, com o Postgres do worktree de pé e as migrations aplicadas:
  `npx tsc -p tsconfig.json --outDir .test-dist && node --env-file-if-exists=.env --test --test-name-pattern="^C<n> " .test-dist/<arquivo>.test.js`.
  As provas abaixo assumem `.test-dist` compilado pelo `tsc` acima.
- Web: `apps/web` ganha runner de teste (hoje não tem nenhum). Comando-base, de `apps/web`:
  `npx tsx --conditions=react-server --test --test-name-pattern="^C<n> " <arquivo>.test.ts`.
  O Nest é substituído por um servidor HTTP local de teste; o repasse real é provado pelo smoke.
- Smoke: `npm run smoke` (`scripts/smoke.mjs`), com o Postgres do worktree de pé; cada asserção nova leva o id do check na mensagem.
- Banco: só o Postgres local do worktree (`127.0.0.1:54312`, banco `hack_12`). O `DATABASE_URL` efetivo de `apps/api/.env` é lido antes de qualquer prova que abre conexão.

## Checks

### S1 - banco local do worktree e migrations · 5 arquivos · ~6 KB · ~2k

**C1** - Com `POSTGRES_PORT=54312` e `POSTGRES_DB=hack_12` no `.env` da raiz, `docker compose up -d --wait` deixa o serviço `postgres` publicado na porta `54312` do host e o banco `hack_12` responde a `select current_database()` com `hack_12` (S1, AC 1)
Proof: `docker compose up -d --wait && docker compose port postgres 5432 | grep -q ':54312$'`
Proof: `docker compose exec -T postgres psql -U hackathon -d hack_12 -tAc 'select current_database()' | grep -qx hack_12`

**C2** - Depois de `npm run db:migrate -w @hackathon/api`, o schema `public` de `hack_12` tem exatamente as tabelas `User`, `Session`, `Account`, `Verification` e `_prisma_migrations`; `User.email` e `Session.token` têm índice único; `User.role` é `NOT NULL` e sem default (S1, AC 2; Relations; porta 2 e porta 3)
Proof: `docker compose exec -T postgres psql -U hackathon -d hack_12 -tAc "select string_agg(table_name, ',' order by table_name) from information_schema.tables where table_schema='public'" | grep -qx 'Account,Session,User,Verification,_prisma_migrations'`
Proof: `docker compose exec -T postgres psql -U hackathon -d hack_12 -tAc "select is_nullable || coalesce(column_default,'SEM_DEFAULT') from information_schema.columns where table_name='User' and column_name='role'" | grep -qx 'NOSEM_DEFAULT'`
Proof: `docker compose exec -T postgres psql -U hackathon -d hack_12 -tAc "select count(*) from pg_indexes where indexdef like 'CREATE UNIQUE INDEX%' and ((tablename='User' and indexdef like '%(email)%') or (tablename='Session' and indexdef like '%(token)%'))" | grep -qx 2`

**C3** - `.env.example` da raiz traz `POSTGRES_PORT` e `POSTGRES_DB`; `apps/api/.env.example` traz `DATABASE_URL=postgresql://hackathon:hackathon@127.0.0.1:…`, `BETTER_AUTH_SECRET` com texto de placeholder, `BETTER_AUTH_URL` e `WEB_ORIGIN` em `127.0.0.1`/`localhost`; nenhum dos dois arquivos tem host fora de `127.0.0.1`/`localhost` (S1, AC 3)
Proof: `grep -qE '^POSTGRES_PORT=[0-9]+$' .env.example && grep -qE '^POSTGRES_DB=[a-z_0-9]+$' .env.example && grep -qE '^DATABASE_URL=postgresql://hackathon:hackathon@127\.0\.0\.1:[0-9]+/' apps/api/.env.example && grep -qE '^BETTER_AUTH_SECRET=' apps/api/.env.example && grep -qE '^(BETTER_AUTH_URL|WEB_ORIGIN)=http://(127\.0\.0\.1|localhost):[0-9]+$' apps/api/.env.example && ! grep -hoE '[a-z]+://([^/@]*@)?[^/:]+' .env.example apps/api/.env.example | sed -E 's#.*://([^/@]*@)?##' | grep -vxE '127\.0\.0\.1|localhost' | grep -q .`

### S2 - configuração obrigatória no boot · 4 arquivos · ~5 KB · ~2k

**C4** - Para cada uma das 4 variáveis (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`), ausente ou vazia, a validação falha com mensagem que contém o nome da variável e não contém o valor de nenhuma das outras; e `node dist/main.js` nessas condições sai com código 1 sem abrir a porta (S2, AC 4)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C4 " .test-dist/config/env.test.js` (tabela sobre as 4 variáveis × ausente/vazia = 8 casos, na função de validação)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C4 " .test-dist/config/boot.test.js` (sobe o `main.js` compilado num diretório sem `.env`, sem `BETTER_AUTH_SECRET`: código de saída 1, stderr cita `BETTER_AUTH_SECRET`, não contém os valores das outras três, e a porta pedida não aceita conexão)

**C5** - `BETTER_AUTH_SECRET` com 31 caracteres encerra o boot com código 1; com 32 caracteres a validação aceita (S2, AC 5)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C5 " .test-dist/config/env.test.js` (bordas 31 e 32)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C5 " .test-dist/config/boot.test.js` (31 caracteres: código de saída 1)

### S3 - cadastros separados por papel e login · 12 arquivos · ~30 KB · ~8k

**C6** - `POST /api/sign-up/clinica` com `name`, `email` novo e `password` de 8 caracteres responde 200, `user.role = "clinica"` e um `set-cookie` de sessão com `HttpOnly` (S3, AC 6)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C6 " .test-dist/auth/sign-up.test.js`

**C7** - `POST /api/sign-up/paciente` com `name`, `email` novo e `password` de 8 caracteres responde 200, `user.role = "paciente"` e um `set-cookie` de sessão com `HttpOnly` (S3, AC 7)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C7 " .test-dist/auth/sign-up.test.js`

**C8** - Nas duas rotas de cadastro, corpo com `role` (`"clinica"` em `/paciente`, `"paciente"` em `/clinica`) ou com um campo extra `foo` responde 400 e a contagem de `User` com aquele e-mail continua 0 (S3, AC 8)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C8 " .test-dist/auth/sign-up.test.js` (tabela: 2 rotas × {`role`, `foo`} = 4 casos)

**C9** - Cadastro com e-mail já cadastrado responde 422 e a contagem de `User` com aquele e-mail continua 1, nos três pares: paciente→clinica, clinica→paciente, paciente→paciente (S3, AC 9; D2)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C9 " .test-dist/auth/sign-up.test.js` (tabela de 3 casos)

**C10** - `password` com 7 caracteres responde 400 nas duas rotas de cadastro e nenhum `User` é criado; 8 caracteres é aceito (C6, C7) (S3, AC 10)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C10 " .test-dist/auth/sign-up.test.js` (2 rotas)

**C11** - `POST /api/auth/sign-up/email` por HTTP, com corpo válido e com `role`, responde 404 e nenhum `User` é criado com aquele e-mail (S3, AC 11; porta 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C11 " .test-dist/auth/sign-up.test.js`

**C12** - `auth.api.signUpEmail` chamado no servidor fora das rotas de cadastro (sem papel no contexto da requisição) não cria `User`; e um insert direto em `User` sem `role` falha no banco (S3, AC 12; porta 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C12 " .test-dist/auth/sign-up.test.js` (chamada ao `auth.api.signUpEmail` sem contexto: rejeita e contagem 0; `prisma.user.create` sem `role` rejeita com erro do banco)

**C13** - `POST /api/auth/sign-in/email` com e-mail e senha corretos responde 200 com `set-cookie` de sessão `HttpOnly` (S3, AC 13)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C13 " .test-dist/auth/session.test.js`

**C14** - Senha errada para e-mail existente e e-mail inexistente respondem 401, com corpos JSON idênticos (S3, AC 14)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C14 " .test-dist/auth/session.test.js`

**C15** - `POST /api/auth/sign-out` com cookie válido responde 200, e `GET /api/me` com o mesmo cookie passa a responder 401 (S3, AC 15)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C15 " .test-dist/auth/session.test.js`

**C16** - `POST /api/auth/update-user` com `{ "role": "clinica" }` e cookie de um paciente responde 400 com código `FIELD_NOT_ALLOWED`, e `GET /api/me` continua devolvendo `role = "paciente"` (S3, AC 16)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C16 " .test-dist/auth/session.test.js`

**C17** - `POST /api/auth/sign-in/email` com cabeçalho `Origin: http://evil.example` (fora de `WEB_ORIGIN`) responde 403 e não devolve `set-cookie` (porta 3, `trustedOrigins`)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C17 " .test-dist/auth/session.test.js`

**C18** - Com `BETTER_AUTH_URL` em `https://`, o `set-cookie` do cadastro traz `Secure`; com `http://127.0.0.1`, não traz (porta 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C18 " .test-dist/auth/session.test.js`

### S4 - guard e leitura de sessão com dono único · 8 arquivos · ~20 KB · ~5k

**C19** - `GET /api/me` com cookie válido responde 200 com um objeto cujas chaves são exatamente `email`, `id`, `name`, `role`, aceito por `sessionUserSchema` de `@hackathon/contracts` (S4, AC 17)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C19 " .test-dist/auth/session.test.js`

**C20** - `GET /api/me` sem cookie, com cookie de sessão adulterado (um caractere trocado) e com cookie de sessão encerrada responde 401 e o corpo não tem `email` nem `id` (S4, AC 18)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C20 " .test-dist/auth/session.test.js` (tabela de 3 casos)

**C21** - Sem cookie, `GET /api/health` responde 200 com `{ status: "ok", service: "api" }` e `GET /api/missing` responde 404 (S4, AC 19)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C21 " .test-dist/app.test.js`

**C22** - Um controller sem `@AllowAnonymous()` registrado num módulo de teste junto do módulo de auth responde 401 sem cookie e 200 com cookie válido: o guard é global, não por rota (S4, AC 20)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C22 " .test-dist/auth/auth-guard.test.js`

**C23** - `AuthSessionService.getSession` com os cabeçalhos de uma requisição com cookie válido devolve `user.id` e `user.role` do usuário cadastrado (`paciente` e `clinica`); sem cookie e com cookie adulterado devolve `null` (S4, AC 21; porta 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C23 " .test-dist/auth/session.test.js`

**C24** - `GET /api/auth/one-time-token/generate` com cookie válido responde 200 com `token` não vazio; sem cookie responde 401 (S4, AC 22)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C24 " .test-dist/auth/one-time-token.test.js`

**C25** - `AuthSessionService.verifyOneTimeToken` com um token recém-gerado devolve a sessão com o mesmo `user.id` e `user.role` de quem gerou (S4, AC 23)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C25 " .test-dist/auth/one-time-token.test.js`

**C26** - O mesmo token verificado uma segunda vez devolve `null` (S4, AC 24)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C26 " .test-dist/auth/one-time-token.test.js`

**C27** - `POST /api/auth/one-time-token/verify` por HTTP, com um token válido no corpo, responde 404, e o token continua verificável uma vez pelo serviço (S4, AC 25; porta 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C27 " .test-dist/auth/one-time-token.test.js`

**C28** - Depois de gerar um token, nenhuma linha de `Verification` contém o token em texto puro (porta 3, `storeToken: "hashed"`)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C28 " .test-dist/auth/one-time-token.test.js`

### S5 - Next repassa o cookie ao Nest · 8 arquivos · ~16 KB · ~4k

**C29** - O repasse do Next para `POST /api/auth/sign-in/email`, `POST /api/sign-up/paciente` e `POST /api/sign-up/clinica` entrega ao Nest o mesmo método, corpo e `cookie`, e devolve o mesmo status, corpo e `set-cookie` que o Nest respondeu (S5, AC 26; porta 4)
Proof: `cd apps/web && npx tsx --conditions=react-server --test --test-name-pattern="^C29 " core/shared/services/api-proxy.test.ts` (tabela das 3 rotas contra servidor local de teste)
Proof: `npm run smoke` (asserção `C29`: cadastro de paciente e login pelo Next contra o Nest real devolvem 200 e `set-cookie`)

**C30** - `POST /api/sign-up/admin` no Next responde 404 e o servidor de teste no lugar do Nest não recebe nenhuma requisição (porta 4)
Proof: `cd apps/web && npx tsx --conditions=react-server --test --test-name-pattern="^C30 " core/shared/services/api-proxy.test.ts`

**C31** - O serviço server-only de sessão chama `GET /api/me` com o cabeçalho `cookie` recebido e devolve o usuário validado por `sessionUserSchema`; a página que o usa mostra o e-mail do usuário logado (S5, AC 27)
Proof: `cd apps/web && npx tsx --conditions=react-server --test --test-name-pattern="^C31 " core/shared/services/session.service.test.ts`
Proof: `npm run smoke` (asserção `C31`: a página, pedida com o cookie do login pelo Next, contém o e-mail cadastrado)

**C32** - O repasse responde 504 quando o Nest não responde dentro do timeout, 502 quando a conexão é recusada, nunca 200; o timeout padrão é 10000 ms (S5, AC 28; porta 4)
Proof: `cd apps/web && npx tsx --conditions=react-server --test --test-name-pattern="^C32 " core/shared/services/api-proxy.test.ts` (servidor que não responde, com timeout injetado curto → 504; porta fechada → 502; constante padrão = 10000)
Proof: `npm run smoke` (asserção `C32`: com a API desligada, `POST /api/auth/sign-in/email` no Next responde 502)

**C33** - O serviço de sessão devolve `null`, sem lançar, quando `GET /api/me` responde 401, quando a conexão falha, quando estoura o timeout e quando o corpo não passa em `sessionUserSchema` (S5, AC 29)
Proof: `cd apps/web && npx tsx --conditions=react-server --test --test-name-pattern="^C33 " core/shared/services/session.service.test.ts` (tabela de 4 casos)

### S6 - job a cada minuto e gateway de exemplo · 4 arquivos · ~6 KB · ~2k

**C34** - O job de exemplo está registrado no `SchedulerRegistry` com a expressão `0 * * * * *`, e uma execução escreve uma linha de log que contém o nome do job e nenhum `email`, `id` ou cookie (S6, AC 30)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C34 " .test-dist/examples/examples.test.js`

**C35** - Um cliente WebSocket conectado em `/socket.io/?EIO=4&transport=websocket` (upgrade 101) que entra no namespace padrão e emite `ping` recebe o evento `pong` (S6, AC 31)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C35 " .test-dist/examples/examples.test.js` (protocolo socket.io sobre o `WebSocket` nativo do Node, sem `socket.io-client`, que é do HACK-38)

### S7 - portões do repositório · 4 arquivos · ~5 KB · ~2k

**C36** - `npm run check`, `npm run build` e `npm run smoke` saem com código 0 no worktree, com o Postgres local de pé e as migrations aplicadas (S7, AC 32; porta 7 compila por `tsc` e `nest build`)
Proof: `npm run check > log 2>&1`
Proof: `npm run build > log 2>&1`
Proof: `npm run smoke > log 2>&1`

**C37** - `npm test -w @hackathon/api` executa os testes de subpastas de `src/`: a saída contém os nomes de `C6` (`auth/`) e `C4` (`config/`) (S7, AC 33)
Proof: `npm test -w @hackathon/api > log 2>&1 && grep -q '^ℹ fail 0$' log && grep -q 'C6 - ' log && grep -q 'C4 - ' log`

**C38** - `.github/workflows/ci.yml` declara um serviço `postgres` com healthcheck e um passo `prisma migrate deploy` (via `npm run db:deploy -w @hackathon/api`) antes de `npm run check`, `npm run build` e `npm run smoke` (S7, AC 34)
Proof: `awk '/services:/{s=1} /postgres/{if(s)p=1} /db:deploy/{d=NR} /npm run check/{c=NR} /npm run build/{b=NR} /npm run smoke/{m=NR} END{exit !(p && d && d<c && c<b && b<m)}' .github/workflows/ci.yml`

## Coverage

| Set (size)                                                      | Member -> proof                                                                                  | Unproven |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| `POST /api/sign-up/paciente` statuses (3)                       | `200` C7 · `400` C8 · `422` C9                                                                   | -        |
| `POST /api/sign-up/clinica` statuses (3)                        | `200` C6 · `400` C10 · `422` C9                                                                  | -        |
| `POST /api/auth/sign-up/email` statuses (1)                     | `404` C11                                                                                        | -        |
| `POST /api/auth/update-user` statuses (1)                       | `400` C16                                                                                        | -        |
| `POST /api/auth/sign-in/email` statuses (3)                     | `200` C13 · `401` C14 · `403` C17                                                                | -        |
| `POST /api/auth/sign-out` statuses (1)                          | `200` C15                                                                                        | -        |
| `GET /api/me` statuses (2)                                      | `200` C19 · `401` C20                                                                            | -        |
| `GET /api/auth/one-time-token/generate` statuses (2)            | `200` C24 · `401` C24                                                                            | -        |
| `POST /api/auth/one-time-token/verify` statuses (1)             | `404` C27                                                                                        | -        |
| `GET /api/health` statuses (1)                                  | `200` C21                                                                                        | -        |
| Next `/api/auth/[...path]` e `/api/sign-up/[role]` statuses (4) | repassado C29 · `404` C30 · `502` C32 · `504` C32                                                | -        |
| socket.io `ping` (1)                                            | `101` + `pong` C35                                                                               | -        |
| variáveis obrigatórias × ausente/vazia (8)                      | C4, table-driven over all 8                                                                      | -        |
| `BETTER_AUTH_SECRET` borda (2 edges)                            | 31 C5 · 32 C5                                                                                    | -        |
| `password` borda (2 edges)                                      | 7 C10 · 8 C6                                                                                     | -        |
| corpo do cadastro proibido (2)                                  | `role` C8 · campo extra C8                                                                       | -        |
| e-mail repetido entre papéis (3)                                | paciente→clinica C9 · clinica→paciente C9 · paciente→paciente C9                                 | -        |
| causas de 401 em `/api/me` (3)                                  | sem cookie C20 · adulterado C20 · encerrada C20                                                  | -        |
| criação de `User` sem papel (2 caminhos)                        | `auth.api.signUpEmail` sem contexto C12 · insert direto C12                                      | -        |
| token de uso único (5 estados)                                  | gerado C24 · primeira verificação C25 · segunda C26 · HTTP desligado C27 · guardado com hash C28 | -        |
| rotas repassadas pelo Next (3)                                  | sign-in C29 · sign-up paciente C29 · sign-up clinica C29                                         | -        |
| falhas da consulta de sessão no Next (4)                        | `401` C33 · conexão C33 · timeout C33 · corpo inválido C33                                       | -        |
| cookie `Secure` (2)                                             | https C18 · http C18                                                                             | -        |
| tabelas da migration (5)                                        | `User` C2 · `Session` C2 · `Account` C2 · `Verification` C2 · `_prisma_migrations` C2            | -        |
| portas de uma via (7)                                           | 1 C1 · 2 C2 · 3 C11, C12, C17, C27, C28 · 4 C29, C30, C32 · 5 C4 · 6 C34, C35 · 7 C36            | -        |
| startup config: validação das 4 variáveis (3 assemblies)        | `main.js` C4 · harness de teste via `createApp` C6 · smoke C36                                   | -        |

- Claims naming a status code, route or response shape: C6-C11, C13-C17, C19-C22, C24, C27, C29, C30, C32, C35 - each has a proof that crosses the HTTP boundary
- C4, C5, C29, C31, C32 provam nos dois níveis (função e fronteira) porque decidem e são alcançados por fronteira
- No other check claims more than the single case its proof exercises

## Swept

- validação: C4, C5, C8, C10
- modos de falha: C14, C20, C32, C33
- idempotência: C9 (e-mail único, um papel por conta), C26 (token consumido na primeira verificação)
- autorização: C11, C12, C16, C17, C20, C22, C27 - papel fixado pela rota, nunca pelo cliente; isolamento por recurso é de HACK-16/HACK-23 (fora do plano)
- concorrência: C2 - dois cadastros simultâneos com o mesmo e-mail param no índice único de `User.email`; sem teste de corrida, o índice é a garantia
- ciclo de vida do dado: C15 (sessão encerrada no sign-out), C26 (token consumido); expiração de sessão em 7 dias e do token em 3 min ficam nos padrões da biblioteca, sem teste por relógio (Assumptions do plano)
- falha de dependência: C32, C33 (Nest indisponível para o Next); Postgres indisponível no boot não tem critério no plano - a conexão do Prisma é preguiçosa e a falha aparece na requisição
- transições de estado: C6/C13 → C15 (sessão criada → encerrada), C24 → C25 → C26 (token gerado → consumido → recusado)
- observabilidade: C4 (mensagem cita o nome, nunca o valor), C34 (log do job sem dado de usuário)

## Handoff

- Arquivos existentes tocados: 13 964 bytes (`wc -c` de `apps/api/src`, manifestos, `tsconfig`, `ci.yml`, `smoke.mjs`, serviços e tela do Next, contratos). Novos estimados: ~80 KB (schema, migration, módulos de config/auth/prisma/exemplos, dois Route Handlers, serviços do Next, testes). Total ~94 KB / 4 ≈ 24k, mais leitura das libs (Better Auth, integração Nest, Prisma 7) ≈ +40k → ~65k.
- S1-S7 somam ~65k, sob o orçamento de 150k - um construtor, sem handoff.
- Base da verificação: `ad7ff67` (merge-base com `origin/main` quando o worktree foi criado). `origin/main` já avançou para `5f35745` (HACK-41); não é trazido para esta branch neste card.

- **Settled mid-build:** C3 - o comando da prova tirava o usuário do `DATABASE_URL` (`://hackathon`) como host e só passava pelo comportamento do `grep -vq` do macOS; trocado por extração do host sem a parte `usuário:senha@`, com controle negativo (`http://evil.com` reprova). A afirmação não mudou.
- **Settled mid-build:** C37 - o comando da prova procurava `^# pass` (saída TAP), mas o reporter padrão do `node --test` gravado em arquivo escreve `ℹ pass N` / `ℹ fail N`; trocado por `^ℹ fail 0$`, que também exige zero falhas. A afirmação não mudou.
- **Settled mid-build:** C36 - decisão do Maestro Fundação em 08/11/2026: `npm run check` está verde em lint, tipos e testes (API 30, web 5, contracts 2) e reprova só no `format:check` de 4 docs que o card não toca e que já reprovam na base `ad7ff67` e em `origin/main` (conteúdo idêntico nas duas): `.specs/features/marketplace-vagas-imagem/brainstorm.md`, `.specs/features/prontuario-pessoal/brainstorm.md`, `docs/product/fluxo-de-trabalho.md`, `docs/product/marketplace-vagas-imagem.md`. Prova da causa pré-existente: `git show ad7ff67:<arquivo> | npx prettier --check --stdin-filepath <arquivo>` falha nos 4. Não formatados aqui (outras frentes editam esses arquivos); o Maestro leva a correção ao geral para a main. `npm run build` e `npm run smoke` verdes. `.maestri/` (pasta local do Maestri) entrou no `.gitignore` e no `.prettierignore` em commit `chore` próprio.
- **Settled mid-build:** porta 7 - `module`/`moduleResolution` ficaram em `nodenext` (o plano aceitava `node16` ou `nodenext`; só o `nodenext` do TS 5.9 aceita `require` de ESM). Tipos de request/response nos controllers vêm de `node:http` para não adicionar `@types/express`. Repasse do Next encaminha também `origin`, `user-agent`, `x-forwarded-for` e `accept` (a checagem de origem do Better Auth e o rate limit por IP dependem deles). Timeout da consulta de sessão no Server Component: 5 s (o plano só fixava os 10 s do repasse). A página inicial mostra a linha de sessão para o smoke provar o C31.
- **Boundary:** C1-C38 fechados em `a83fbbe` (um construtor, sem lotes)
- **Abandoned:** nenhum.
