# HACK-12 seg · cadastro com origem, tipo e taxa; segredo de exemplo recusado

Profile: light
Plan: nenhum (mudança curta; ver `## Intent`)

## Intent

Hoje `POST /api/sign-up/paciente` e `POST /api/sign-up/clinica` chamam `auth.api.signUpEmail` fora do roteador do Better Auth e por isso perdem a checagem de origem, a restrição a JSON e o rate limit dele; o `express.urlencoded` da integração aceita formulário nessas rotas. Um formulário HTML em `evil.example` que posta para `WEB_ORIGIN/api/sign-up/paciente` cria a conta do atacante e devolve o cookie de sessão à vítima (login-CSRF). E o `BETTER_AUTH_SECRET` de exemplo do `.env.example` passa a validação do boot. Depois desta mudança, as duas rotas de cadastro recusam origem ausente ou estranha (403), corpo que não é JSON (415) e excesso de tentativas por IP (429), por um guard do Nest e pelo `@nestjs/throttler` com armazenamento em memória, ligados sempre (sem `NODE_ENV`); o `.env.example` traz o segredo vazio e o boot recusa o segredo de exemplo citando só o nome da variável. R2 (`x-forwarded-for`) fica para o HACK-14.

10 checks em 3 fatias · 0 portas de uma via · 0 perguntas abertas

Convenções das provas:

- API: cada teste começa pelo id do check (`C1 - …`). Comando-base, de `apps/api`, com o Postgres do worktree de pé (`127.0.0.1:54314`, banco `hack_12_seg`) e as migrations aplicadas:
  `npx tsc -p tsconfig.json --outDir .test-dist && node --env-file-if-exists=.env --test --test-name-pattern="^C<n> " .test-dist/<arquivo>.test.js`.
- Arquivo novo de prova: `apps/api/src/auth/sign-up-protection.test.ts`. Os ids C4, C5 e C6–C10 de HACK-12 já existem em `env.test.ts`, `boot.test.ts` e `sign-up.test.ts`; os testes novos desses arquivos usam ids que não colidem (C8, C9).
- Smoke: `npm run smoke` (`scripts/smoke.mjs`); a asserção nova leva o id do check na mensagem.
- `N` é o limite de cadastros por IP por rota na janela de 60 s (decidido: `N = 30`); a prova lê o valor da constante exportada, não um número repetido.
- Decisão do Maestro Fundação (08/11/2026): `N = 30` por 60 s por rota. Motivo: sem R2, pelo Next todos os cadastros caem no mesmo balde (IP do Next) e 10/min poderia travar a demo com várias pessoas cadastrando juntas; 30 ainda corta automação.

## Checks

### S1 - origem e tipo de conteúdo nas rotas de cadastro · 4 arquivos · ~12 KB · ~4k

**C1** - Nas duas rotas, `POST` com `content-type: application/x-www-form-urlencoded`, corpo `name=…&email=…&password=…` válido e `Origin: http://evil.example` responde 403, não devolve `set-cookie` e a contagem de `User` com aquele e-mail continua 0 (R1, teste hostil)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C1 " .test-dist/auth/sign-up-protection.test.js` (2 rotas)

**C2** - Nas duas rotas, corpo JSON válido com `Origin` ausente, `http://evil.example`, `null` ou `WEB_ORIGIN` com outra porta responde 403 com `code = "ORIGIN_NOT_ALLOWED"`, sem `set-cookie`, e nenhum `User` é criado (R1)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C2 " .test-dist/auth/sign-up-protection.test.js` (tabela: 2 rotas × 4 origens = 8 casos)

**C3** - Nas duas rotas, com `Origin = WEB_ORIGIN`, `content-type` `application/x-www-form-urlencoded`, `text/plain`, `multipart/form-data` ou ausente responde 415 e nenhum `User` é criado; `application/json; charset=utf-8` é aceito com 200 (R1)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C3 " .test-dist/auth/sign-up-protection.test.js` (tabela: 2 rotas × 4 tipos recusados + 2 rotas × 1 aceito = 10 casos)

**C4** - Regressão: JSON válido com `Origin = WEB_ORIGIN` continua respondendo 200 com papel e cookie `HttpOnly` nas duas rotas, e os casos 400 (corpo com `role`/campo extra, senha curta) e 422 (e-mail repetido) continuam iguais (R1; HACK-12 C6–C10)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C(6|7|8|9|10) " .test-dist/auth/sign-up.test.js`

**C5** - Pelo Next: `POST WEB/api/sign-up/paciente` urlencoded com `Origin: http://evil.example` responde 403 e o e-mail não vira `User`; o cadastro JSON com a origem do Next continua 200 com `set-cookie` (R1, repasse do `origin`; HACK-12 C29)
Proof: `npm run smoke` (asserção nova `C5` hostil pelo Next; asserção existente `C29` cadastro e login pelo Next)

### S2 - limite de taxa nas rotas de cadastro · 3 arquivos · ~6 KB · ~2k

**C6** - Do mesmo IP, numa janela de 60 s, as `N` primeiras requisições válidas a uma rota de cadastro não recebem 429 e a `N+1`-ésima responde 429 sem criar `User`; a contagem é por rota (a `N+1`-ésima em `/paciente` não bloqueia `/clinica`) (R1)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C6 " .test-dist/auth/sign-up-protection.test.js`

**C7** - O guard de origem/tipo e o limite de taxa não dependem de `NODE_ENV`: nenhum arquivo de `apps/api/src` lê `NODE_ENV`, e C1–C3 e C6 passam com `NODE_ENV=production` (R1)
Proof: `! grep -rn "NODE_ENV" apps/api/src`
Proof: `cd apps/api && NODE_ENV=production node --env-file-if-exists=.env --test --test-name-pattern="^C(1|2|3|6) " .test-dist/auth/sign-up-protection.test.js`

### S3 - segredo de exemplo recusado no boot · 4 arquivos · ~6 KB · ~2k

**C8** - `loadEnv` recusa `BETTER_AUTH_SECRET` igual ao placeholder antigo (`troque-por-um-segredo-local-de-32-caracteres`) e valores de 32+ caracteres que contêm `troque`, `change-me` ou `changeme` (sem diferenciar maiúsculas); a mensagem cita `BETTER_AUTH_SECRET` e não contém o valor; um segredo aleatório de 44 caracteres é aceito (R3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C8 " .test-dist/config/env.test.js` (tabela: placeholder antigo + 3 marcadores × caixa alta/baixa + 1 aceito)

**C9** - `node main.js` com `BETTER_AUTH_SECRET` igual ao placeholder antigo sai com código 1, a saída cita `BETTER_AUTH_SECRET`, não contém o valor e a porta não aceita conexão (R3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C9 " .test-dist/config/boot.test.js`

**C10** - `apps/api/.env.example` traz a linha `BETTER_AUTH_SECRET=` vazia, com o comentário de como gerar um local (R3)
Proof: `grep -qx 'BETTER_AUTH_SECRET=' apps/api/.env.example && grep -q 'openssl rand' apps/api/.env.example`

## Coverage

| Set (size)                                       | Member -> proof                                                                               | Unproven |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------- |
| rotas protegidas (2)                             | `/api/sign-up/paciente` C1 C2 C3 C6 · `/api/sign-up/clinica` C1 C2 C3 C6                      | -        |
| `Origin` recusado (5)                            | evil.example urlencoded C1 · ausente C2 · evil.example JSON C2 · `null` C2 · porta errada C2  | -        |
| `content-type` (5)                               | urlencoded C3 · text/plain C3 · multipart C3 · ausente C3 · json+charset aceito C3            | -        |
| `POST /api/sign-up/:role` statuses (6)           | 200 C4 · 400 C4 · 403 C1 C2 · 415 C3 · 422 C4 · 429 C6                                        | -        |
| marcadores de segredo de exemplo (4)             | placeholder antigo C8 C9 · `troque` C8 · `change-me` C8 · `changeme` C8                       | -        |
| startup config: guard e throttler (2 assemblies) | `createApp` usado por `main.js` C5 C9 · harness de teste (`startTestApp` → `createApp`) C1 C6 | -        |

- Claims com status, rota ou forma de resposta: C1, C2, C3, C4, C5, C6 - cada um com prova que cruza o HTTP real
- Nenhum outro check afirma mais que os casos que sua prova exercita

## Swept

- validation: C2, C3, C8
- failure modes: C1, C2, C3, C6, C9
- idempotency: n/a - cadastro repetido já é 422 (HACK-12 C9, regressão em C4)
- authorization: C1, C2 - as rotas são públicas por desenho (`@AllowAnonymous`); a proteção nova é de origem, não de identidade
- concurrency: n/a - throttler em memória de uma instância, aceito pelo card; sem escrita concorrente nova
- data lifecycle: C1, C2, C3, C6 - requisição recusada não cria `User`
- dependency failure: n/a - nenhuma chamada externa nova; armazenamento do throttler é local ao processo
- state transitions: n/a - sem máquina de estados
- observability: n/a - nenhum log novo; mensagem de boot cita só o nome da variável (C8, C9)

## Out of scope

- R2 (`x-forwarded-for` confiável atrás do Next) - vai ao HACK-14. Até lá, pelo Next todos os clientes chegam ao Nest com o IP do Next, então o limite de C6 vale, na prática, para o conjunto dos cadastros que passam pelo proxy.
- Rotas do roteador do Better Auth (`/api/auth/*`) - já têm origem e rate limit próprios.

## Handoff

- S1 = 4k, S2 entra em 6k, S3 fecha em 8k, tudo em `apps/api/src/auth`, `apps/api/src/config`, `apps/api/.env.example` e `scripts/smoke.mjs`; dependência nova `@nestjs/throttler` (npm install com o lock pesado) - um construtor, abaixo do orçamento
