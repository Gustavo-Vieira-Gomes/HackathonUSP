# HACK-16 checks

Profile: standard
Plan: `.specs/features/hack-16-cadastro-login-clinica/plan.md`

Perfil `standard` e não `light` (o padrão do contrato dos maestros): o card cria o guard de isolamento entre clínicas (RN-04, F2) que HACK-17 a 20 consomem, e o cadastro tem tabela de validação, dependência externa e corrida de CNES. Um teste que passa com implementação errada aqui vira vazamento entre clínicas em quatro cards. Na dúvida entre dois perfis, o mais alto.

Adendo da aprovação (Maestro, 08/11/2026): C16 e C17 ganham `GEOCODER_MIN_INTERVAL_MS` (padrão 1000; a suíte usa 0, exceto o C16), antes de qualquer código.

38 checks em 4 fatias · 6 portas de uma via · 0 perguntas abertas que bloqueiam o build (a 3 do plano bloqueia só go-live)

**Como as provas rodam.**

- API: em `apps/api`, com o Postgres do worktree no ar (`127.0.0.1:54316`, banco `hack_16`; `DATABASE_URL` do `.env` lido antes de cada execução) e depois de `npx prisma generate && npx tsc -p tsconfig.json --outDir .test-dist`. `RUN` = `node --env-file-if-exists=.env --test`, com `--test-name-pattern` **antes** do arquivo. Os testes novos se chamam `H16-C<n> - ...` para não colidir com os `C<n>` do HACK-12. Arquivos: `CSU` = `.test-dist/modules/clinics/clinic-sign-up.test.js`; `CG` = `.test-dist/modules/clinics/clinic-guard.test.js`; `GEO` = `.test-dist/modules/clinics/geocoding.service.test.js`; `PIPE` = `.test-dist/common/pipes/zod-body.pipe.test.js`; `ENV` = `.test-dist/config/env.test.js`; `PROT` = `.test-dist/auth/sign-up-protection.test.js`.
- Geocodificador falso: servidor HTTP em porta efêmera dentro do próprio teste, com `GEOCODER_URL` apontando para ele no `startTestApp`; conta as requisições recebidas e pode responder lista, lista vazia, status ≠ 200, corpo fora do formato, atrasar ou segurar a resposta até um sinal. Nenhuma prova chama o Nominatim real.
- Contratos: `CT` = `cd packages/contracts && npx tsx --test --test-name-pattern="<padrão>" src/clinic.test.ts`.
- Web: `WEB` = `cd apps/web && TZ=UTC npx tsx --conditions=react-server --test --test-name-pattern="<padrão>"` sobre `core/modules/clinic/**/*.test.ts`.
- `SMOKE` = `npm run smoke` (exige `npm run build`, operação pesada: com o lock `.worktrees/.lock-pesado`). O smoke sobe um geocodificador falso e passa `GEOCODER_URL` à API.
- `PORTAL` = roteiro no portal do Maestri contra `npm run dev` do worktree (web 3160, API 3161) com a API apontando `GEOCODER_URL` para um geocodificador falso local; cada passo registra o resultado observado (URL, texto, foco, árvore de acessibilidade) em `.specs/features/hack-16-cadastro-login-clinica/portal.md`. É prova de comportamento de navegador que nenhum runner do repo alcança (não há Playwright instalado e o card não adiciona dependência).

## Checks

### S1 - contrato e cadastro num passo · 14 arquivos · ~95 KB · ~24k

**C1** - `POST /api/sign-up/clinica` com corpo válido (2 faixas de expediente), origem `WEB_ORIGIN` e geocodificador devolvendo `[{"lat":"-23.5617","lon":"-46.6560"}]` responde 200 com `user.role = 'clinica'`, `clinic.latitude = -23.5617`, `clinic.longitude = -46.6560`, um `set-cookie` com `session_token` e `HttpOnly`; o banco fica com 1 `User` com o e-mail, 1 `Clinic` com `name`, `address`, `cnes`, `technicalManager` iguais aos do corpo e exatamente 2 `ClinicOpeningHours` com os `weekday`/`startMinute`/`endMinute` enviados; o corpo da resposta passa no `signUpResponse` de clínica dos contratos (S1, AC 1)
Proof: `RUN --test-name-pattern="^H16-C1 - " CSU`

**C2** - Para cada um dos 7 campos obrigatórios (`name`, `email`, `password`, `address`, `cnes`, `technicalManager`, `openingHours`), o corpo válido sem esse campo responde 422 com `code = 'VALIDATION_FAILED'` e `fields` contendo o nome do campo; o geocodificador falso recebe 0 requisições e o banco tem 0 `User` com o e-mail e 0 `Clinic` com o CNES (S1, AC 2)
Proof: `RUN --test-name-pattern="^H16-C2 - " CSU` (tabela: 7 casos)

**C3** - `clinicSignUpBodySchema` recusa, com o campo no caminho da issue: `cnes` `'123456'`, `'12345678'`, `'12345a7'`; `address` com 4 caracteres depois do trim; `technicalManager` com 2 caracteres depois do trim; `name` só com espaços; `password` com 7 caracteres; e aceita `cnes = '1234567'`, `address` com 5 caracteres e `technicalManager` com 3 (S1, AC 3; porta 2)
Proof: `cd packages/contracts && npx tsx --test --test-name-pattern="^H16-C3 - " src/clinic.test.ts` (tabela: 7 recusas, 3 aceites)
Proof: `RUN --test-name-pattern="^H16-C3 - " CSU` (HTTP: `cnes` com 6 dígitos → 422 com `fields` contendo `cnes`, 0 `User`)

**C4** - `clinicSignUpBodySchema` recusa `openingHours` e devolve o caminho: `[]` → `openingHours`; `{weekday:1,startMinute:600,endMinute:600}` → `openingHours.0.endMinute`; `weekday: 7` e `weekday: -1` → `openingHours.0.weekday`; `endMinute: 1441` → `openingHours.0.endMinute`; 15 faixas válidas → `openingHours`; duas faixas no mesmo `weekday` (480–720 e 700–900) → `openingHours.1.startMinute`; e aceita `startMinute: 0`, `endMinute: 1440`, `weekday` 0 e 6, e faixas encostadas (480–720 e 720–900) (S1, AC 4; porta 2)
Proof: `cd packages/contracts && npx tsx --test --test-name-pattern="^H16-C4 - " src/clinic.test.ts` (tabela: 7 recusas, 4 aceites)
Proof: `RUN --test-name-pattern="^H16-C4 - " CSU` (HTTP: faixas sobrepostas → 422 com `fields` contendo `openingHours.1.startMinute`, 0 `User`, 0 `Clinic`, 0 `ClinicOpeningHours` novas)

**C5** - O corpo válido acrescido de `role`, `clinicId`, `latitude` ou `longitude` (um por vez) responde 422 `VALIDATION_FAILED` com o nome do campo extra em `fields` e 0 `User` com o e-mail (S1, AC 5)
Proof: `RUN --test-name-pattern="^H16-C5 - " CSU` (tabela: 4 casos)

**C6** - `new ZodBodyPipe(schema).transform(valor)` lança `UnprocessableEntityException` com `getStatus() = 422` e resposta `{ code: 'VALIDATION_FAILED', message: 'Campos inválidos ou ausentes.', fields }`: para `undefined`, `null`, `'texto'` e `[]` → `fields = ['body']`; para objeto com duas issues no mesmo caminho → esse caminho uma vez só; valor válido → devolve o dado parseado (porta 3)
Proof: `RUN --test-name-pattern="^H16-C6 - " PIPE` (tabela: 4 corpos não objeto, 1 duplicado, 1 aceito)

**C7** - Com o geocodificador falso devolvendo `[]`, o cadastro responde 422 com `code = 'ADDRESS_NOT_FOUND'` e `fields = ['address']`, sem `set-cookie`, e o banco tem 0 `User` com o e-mail e 0 `Clinic` com o CNES (S1, AC 6)
Proof: `RUN --test-name-pattern="^H16-C7 - " CSU`

**C8** - Com o geocodificador falso respondendo 500, 429, `{}` (não lista), `[{"lat":"abc","lon":"-46.6"}]`, atrasando 5100 ms, ou com `GEOCODER_URL` numa porta fechada, o cadastro responde 503 com `code = 'GEOCODING_UNAVAILABLE'`, sem `set-cookie`, 0 `User` com o e-mail e 0 `Clinic` com o CNES; o caso de atraso responde em menos de 6000 ms (S1, AC 7; porta 5)
Proof: `RUN --test-name-pattern="^H16-C8 - " CSU` (tabela: 6 casos)

**C9** - Cadastro com e-mail que já tem conta (e CNES novo) responde 422 com o código do Better Auth; o banco segue com 1 `User` com o e-mail e 0 `Clinic` com o CNES novo (S1, AC 8)
Proof: `RUN --test-name-pattern="^H16-C9 - " CSU`

**C10** - Cadastro com CNES de uma clínica já gravada (e e-mail novo) responde 422 com `code = 'CNES_TAKEN'` e `fields = ['cnes']`, sem `set-cookie`; o banco tem 0 `User` com o e-mail novo, 1 `Clinic` com o CNES, e o geocodificador recebe 0 requisições dessa chamada (S1, AC 9)
Proof: `RUN --test-name-pattern="^H16-C10 - " CSU`

**C11** - Duas requisições simultâneas com o mesmo CNES e e-mails diferentes, sincronizadas pelo geocodificador falso (segura as duas respostas até receber a segunda requisição, sinal explícito, sem `sleep`): os status ordenados são `[200, 422]`, a 422 traz `code = 'CNES_TAKEN'` e nenhum `set-cookie`; o banco termina com 1 `Clinic` com o CNES, 1 `User` com o e-mail vencedor e 0 com o perdedor (S1, AC 10)
Proof: `RUN --test-name-pattern="^H16-C11 - " CSU`

**C12** - Em `POST /api/sign-up/clinica` com o corpo novo de clínica, origem estranha responde 403, corpo não JSON responde 415 e a 31ª tentativa do mesmo IP na janela responde 429, sem criar `User` (S1, AC 11)
Proof: `RUN --test-name-pattern="^C(1|2|3|6) - " PROT` (testes do HACK-12 que já iteram as 2 rotas, passando a mandar o corpo de clínica válido)

**C13** - `GeocodingService.geocode` registra exatamente uma linha `warn` por falha, contendo o motivo (`status=500`, `timeout`, `network`, `invalid_body`) e a duração no formato `<n>ms`, e a linha não contém o endereço enviado; uma chamada com sucesso não registra `warn` (S4, AC 29)
Proof: `RUN --test-name-pattern="^H16-C13 - " GEO` (tabela: 4 motivos + 1 sucesso, logger capturado)
Proof: `RUN --test-name-pattern="^H16-C13 - " CSU` (HTTP, caso de timeout: o log capturado da aplicação tem a linha `warn` com `timeout` e não contém endereço, e-mail nem senha do corpo)

**C14** - No caso perdedor do C11, o log da aplicação tem uma linha `warn` com `CNES_TAKEN` e o id do `User` removido, e nenhuma linha de log da requisição contém o e-mail perdedor (S4, AC 30)
Proof: `RUN --test-name-pattern="^H16-C11 - " CSU`

**C15** - `GeocodingService.geocode('Av. Paulista, 1000')` faz uma requisição `GET` em `<GEOCODER_URL>/search` com os parâmetros `format=jsonv2`, `limit=1`, `countrycodes=br` e `q=Av. Paulista, 1000`, header `User-Agent: hackathon-usp-marketplace/0.1` quando `GEOCODER_USER_AGENT` não está definido, e devolve `{ latitude: -23.5617, longitude: -46.6560 }` para `[{"lat":"-23.5617","lon":"-46.6560"}]` e `null` para `[]`; com `GEOCODER_USER_AGENT` definido, usa o valor dado (porta 5)
Proof: `RUN --test-name-pattern="^H16-C15 - " GEO`

**C16** - Com `GEOCODER_MIN_INTERVAL_MS = 1000`, três chamadas a `geocode` disparadas juntas no mesmo processo chegam ao geocodificador falso com pelo menos 1000 ms entre uma requisição e a seguinte, e nenhuma é refeita depois de uma falha (500 na primeira → 1 requisição só para ela); com `GEOCODER_MIN_INTERVAL_MS = 0`, as três chegam sem espera imposta (porta 5 e adendo; premissa «1 req/s» confirmada)
Proof: `RUN --test-name-pattern="^H16-C16 - " GEO`

**C17** - `loadEnv` sem `GEOCODER_URL`, `GEOCODER_USER_AGENT` e `GEOCODER_MIN_INTERVAL_MS` devolve `GEOCODER_URL = 'https://nominatim.openstreetmap.org'`, `GEOCODER_USER_AGENT = 'hackathon-usp-marketplace/0.1'` e `GEOCODER_MIN_INTERVAL_MS = 1000`; `GEOCODER_URL = 'nao-e-url'` e `GEOCODER_MIN_INTERVAL_MS = '-1'` ou `'abc'` lançam `EnvValidationError` citando a variável; o `apps/api/.env.example` tem as três linhas e nenhum e-mail (porta 5 e adendo)
Proof: `RUN --test-name-pattern="^H16-C17 - " ENV`
Proof: `grep -q '^GEOCODER_URL=' apps/api/.env.example && grep -q '^GEOCODER_USER_AGENT=' apps/api/.env.example && grep -q '^GEOCODER_MIN_INTERVAL_MS=' apps/api/.env.example && ! grep -i geocoder apps/api/.env.example | grep -q '@'`

**C18** - A suíte da API inteira passa com o corpo novo: `signUpWithCookie(t, 'clinica')` cria a clínica com perfil pelo geocodificador falso, e os casos `clinica` de `sign-up.test.ts`, `sign-up-protection.test.ts`, `session.test.ts` e `one-time-token.test.ts` seguem verdes sem asserção removida nem enfraquecida (Impact: testes existentes)
Proof: `npm run test -w @hackathon/api > /tmp/hack16-api.log 2>&1` com exit 0, e `git diff origin/main -- 'apps/api/src/**/*.test.ts'` sem linha `-` de `assert` que não volte reescrita com o mesmo valor esperado

### S2 - guard de clínica e isolamento · 6 arquivos · ~30 KB · ~8k

**C19** - A Clínica A, logada, em `GET /api/clinic/vacancies/<id de vaga num horário da Clínica B>` recebe 404 com corpo exatamente `{ code: 'NOT_FOUND', message: 'Vaga não encontrada.' }` (sem `state`, `origin`, `currentPriceCents`, `slot` nem o id da vaga) (S2, AC 12; porta 4, porta 6)
Proof: `RUN --test-name-pattern="^H16-C19 - " CG`

**C20** - A Clínica A em `GET /api/clinic/vacancies/<id da vaga dela>` recebe 200 com `id`, `state`, `origin`, `currentPriceCents`, `slot.startsAt`, `slot.endsAt`, `slot.examId` iguais aos do banco, e o corpo passa em `clinicVacancySchema` (S2, AC 13; porta 6)
Proof: `RUN --test-name-pattern="^H16-C20 - " CG`

**C21** - `GET /api/clinic/vacancies/abc` e `GET /api/clinic/vacancies/<uuid aleatório>` com a sessão da Clínica A respondem 404 com o mesmo corpo do C19 (S2, AC 14)
Proof: `RUN --test-name-pattern="^H16-C21 - " CG` (tabela: 2 casos)

**C22** - Sem cookie, `GET /api/clinic/me` e `GET /api/clinic/vacancies/<id da vaga da A>` respondem 401 (S2, AC 15)
Proof: `RUN --test-name-pattern="^H16-C22 - " CG` (tabela: 2 rotas)

**C23** - Com sessão de conta `paciente`, as duas rotas respondem 403 (S2, AC 16)
Proof: `RUN --test-name-pattern="^H16-C23 - " CG` (tabela: 2 rotas)

**C24** - Com sessão de conta `clinica` cuja linha de `Clinic` foi apagada, as duas rotas respondem 403 com `code = 'CLINIC_PROFILE_MISSING'` (S2, AC 17; porta 4)
Proof: `RUN --test-name-pattern="^H16-C24 - " CG` (tabela: 2 rotas)

**C25** - A Clínica A em `GET /api/clinic/me?clinicId=<id da B>` com header `x-clinic-id: <id da B>` recebe 200 com o `id`, o `cnes` e o `openingHours` da A (não os da B), e o corpo passa em `clinicProfileSchema` (S2, AC 18)
Proof: `RUN --test-name-pattern="^H16-C25 - " CG`

**C26** - A API do guard existe na forma literal da porta 4: `ClinicOnly` é `applyDecorators(Roles(['clinica']), UseGuards(ClinicGuard))`, `CurrentClinicId` é `createParamDecorator` que devolve `request.clinicId`, `ClinicsModule` exporta `ClinicGuard`, e a aplicação de `createApp` resolve `app.get(ClinicGuard)` e `app.get(ClinicSignUpService)` sem erro (porta 1, porta 4)
Proof: `RUN --test-name-pattern="^H16-C26 - " CG`
Proof: `grep -n "applyDecorators(Roles(\['clinica'\]), UseGuards(ClinicGuard))" -r apps/api/src/modules/clinics && grep -n "exports: \[ClinicGuard" apps/api/src/modules/clinics/clinics.module.ts`

### S3 - telas de cadastro, login e painel · 12 arquivos · ~45 KB · ~12k

**C27** - `toOpeningHours(dias)` com domingo «Fechado», segunda a sexta `08:00`–`18:00` e sábado `08:00`–`12:00` devolve 6 faixas com `weekday` 1..5 → `startMinute = 480`, `endMinute = 1080` e `weekday = 6` → `480`/`720`, sem `weekday = 0`; o resultado é o mesmo com `TZ=UTC` e `TZ=America/Sao_Paulo` (conversão por `HH:MM`, sem `Date`) (S3, AC 22)
Proof: `cd apps/web && TZ=UTC npx tsx --conditions=react-server --test --test-name-pattern="^H16-C27 - " core/modules/clinic/opening-hours.test.ts`

**C28** - `signUpErrorView(status, corpo)` devolve, para 422 com `fields = ['cnes', 'openingHours.3.startMinute']`, uma mensagem para o campo `cnes` e outra para o campo de abertura de quarta-feira, e `firstField = 'cnes'`; para 422 `ADDRESS_NOT_FOUND`, mensagem no campo `address`; para 503, 502, 504 e 429, uma mensagem geral que contém «Tente de novo em instantes» e nenhuma mensagem de campo (S3, AC 20, AC 21)
Proof: `cd apps/web && TZ=UTC npx tsx --conditions=react-server --test --test-name-pattern="^H16-C28 - " core/modules/clinic/sign-up-errors.test.ts` (tabela: 2 casos 422 + 4 status)

**C29** - `loadClinicPanel(cookie, deps)` decide os 4 ramos do painel: sem sessão → `redirect` para `/clinica/login`; sessão `paciente` → `not-clinic` com 0 chamadas a `getClinicProfile`; sessão `clinica` com perfil → `profile`; sessão `clinica` com perfil indisponível → `error` (S3, AC 24, AC 26, AC 27)
Proof: `cd apps/web && TZ=UTC npx tsx --conditions=react-server --test --test-name-pattern="^H16-C29 - " core/modules/clinic/clinic-panel.test.ts` (tabela: 4 ramos)

**C30** - `getClinicProfile(cookie)` devolve indisponível quando a API fake responde 500, quando atrasa além do timeout (5000 ms, reduzido por opção no teste), quando o corpo não passa em `clinicProfileSchema` e quando a conexão falha; devolve o perfil quando o corpo é válido (S3, AC 27)
Proof: `cd apps/web && TZ=UTC npx tsx --conditions=react-server --test --test-name-pattern="^H16-C30 - " core/modules/clinic/clinic-profile.service.test.ts` (tabela: 4 falhas + 1 sucesso)

**C31** - Pelo Next de produção: cadastro de clínica em `POST /api/sign-up/clinica` do Next responde 200 com cookie; `GET /clinica` com esse cookie responde 200 e o HTML contém o nome, o endereço, o CNES, o responsável técnico e «Fechado» (domingo sem faixa); `GET /clinica` sem cookie responde redirecionamento com `location` terminando em `/clinica/login`; `GET /clinica` com cookie de `paciente` contém «Esta conta não é de clínica» e «Sair» (S3, AC 24, AC 25, AC 26)
Proof: `npm run smoke > /tmp/hack16-smoke.log 2>&1` com exit 0 e `grep -c 'H16-C31' scripts/smoke.mjs` ≥ 4 (uma asserção por afirmação: painel, redirecionamento, paciente, cadastro pelo Next)

**C32** - No portal, `/clinica/cadastro` preenchido com dados válidos e enviado mostra «Cadastrando…» com o botão `disabled` antes da resposta (geocodificador falso atrasando 2 s) e termina na URL `/clinica` com o CNES na tela (S3, AC 19)
Proof: `PORTAL` passo P1, registrado em `portal.md`

**C33** - No portal, `/clinica/cadastro` com CNES de 6 dígitos mostra a mensagem de erro junto do campo CNES, mantém os outros valores digitados e deixa o foco (`document.activeElement`) no campo CNES (S3, AC 20)
Proof: `PORTAL` passo P2, registrado em `portal.md`

**C34** - No portal, com o geocodificador falso respondendo 500, `/clinica/cadastro` mostra «Tente de novo em instantes» e mantém os valores digitados (S3, AC 21)
Proof: `PORTAL` passo P3, registrado em `portal.md`

**C35** - No portal, `/clinica/cadastro` mostra domingo a sábado, cada um com a opção «Fechado» e os campos de abertura e fechamento (S3, AC 22)
Proof: `PORTAL` passo P4, registrado em `portal.md`

**C36** - No portal, `/clinica/login` com e-mail e senha corretos termina em `/clinica`; com senha errada mostra «E-mail ou senha inválidos» e o campo de e-mail mantém o valor (S3, AC 23)
Proof: `PORTAL` passo P5, registrado em `portal.md`

**C37** - No portal, a árvore de acessibilidade de `/clinica/cadastro` e `/clinica/login` não tem campo de entrada sem nome acessível vindo de `<label>`, e o cadastro e o login completam só com Tab, Espaço e Enter (S3, AC 28)
Proof: `PORTAL` passo P6, registrado em `portal.md`

### S4 - observabilidade · coberta por C13 e C14 · ~0k

**C38** - Nenhum log novo do card contém senha, e-mail ou endereço: as linhas `warn` de C13 e C14 são as únicas linhas de log que os arquivos novos de `apps/api/src/modules/clinics/` emitem (S4, AC 29, AC 30)
Proof: `RUN --test-name-pattern="^H16-C13 - " CSU`
Proof: `! grep -rnE "logger\.(log|warn|error|debug)\(.*(email|password|address)" apps/api/src/modules/clinics`

## Coverage

| Set (size)                                           | Member -> proof                                                                                                     | Unproven |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| `POST /api/sign-up/clinica` statuses (6)             | 200 C1 · 403 C12 · 415 C12 · 422 C2 · 429 C12 · 503 C8                                                              | -        |
| `GET /api/clinic/me` statuses (3)                    | 200 C25 · 401 C22 · 403 C23                                                                                         | -        |
| `GET /api/clinic/vacancies/:id` statuses (4)         | 200 C20 · 401 C22 · 403 C23 · 404 C19                                                                               | -        |
| campos obrigatórios do corpo (7)                     | C2, table-driven over all 7                                                                                         | -        |
| campos fora do contrato (4)                          | `role` C5 · `clinicId` C5 · `latitude` C5 · `longitude` C5                                                          | -        |
| recusas de `openingHours` (6)                        | vazio C4 · início ≥ fim C4 · `weekday` fora C4 · `endMinute` > 1440 C4 · mais de 14 C4 · sobreposição C4            | -        |
| limites aceitos de faixa (4)                         | `startMinute` 0 C4 · `endMinute` 1440 C4 · `weekday` 0/6 C4 · faixas encostadas C4                                  | -        |
| erros 422 de regra (3)                               | `CNES_TAKEN` C10 · `ADDRESS_NOT_FOUND` C7 · e-mail repetido C9                                                      | -        |
| falhas do geocodificador (6)                         | status 500 C8 · status 429 C8 · corpo não lista C8 · lat inválida C8 · timeout C8 · rede C8                         | -        |
| motivos de log do geocodificador (4)                 | `status=<n>` C13 · `timeout` C13 · `network` C13 · `invalid_body` C13                                               | -        |
| ramos do guard (4)                                   | sem sessão C22 · `paciente` C23 · `clinica` sem perfil C24 · `clinica` com perfil C20                               | -        |
| fontes de id de clínica ignoradas (2)                | query `clinicId` C25 · header `x-clinic-id` C25                                                                     | -        |
| portas de uma via (6)                                | módulo C26 · corpo C3 · formato 422 C6 · API do guard C26 · geocodificação C15 · leitura de vaga C19                | -        |
| ramos do painel `/clinica` (4)                       | sem sessão C29 · `paciente` C29 · perfil C29 · erro C30                                                             | -        |
| status com mensagem de indisponibilidade na tela (4) | 503 C28 · 502 C28 · 504 C28 · 429 C28                                                                               | -        |
| dias da semana na tela (7)                           | C27, table-driven over all 7 (0 «Fechado», 1..6 com faixa) · C35 na tela                                            | -        |
| estados de tela (6)                                  | carregando C32 · erro de campo C33 · indisponível C34 · login errado C36 · não autorizado C31 · vazio «Fechado» C31 | -        |
| startup config: `GEOCODER_*` (2 assemblies)          | `createApp` de `main.ts` C17 · `startTestApp` C1                                                                    | -        |

- `startTestApp` usa o mesmo `createApp` do `main.ts`; a diferença entre as duas montagens é só a origem das variáveis, por isso a prova da validação fica no `loadEnv` (C17) e a do valor efetivo no harness (C1).
- Relations: o plano declara `None` (nenhuma mudança de forma); a unicidade do CNES e o 1:1 já existentes são exercidos por C10 e C11.
- Claims naming a status code, route or response shape: C1, C2, C5, C7 a C12, C19 a C25, C31 - cada um com prova que atravessa a fronteira HTTP.
- Nenhum outro check afirma mais que o caso que sua prova exercita; C3, C4, C13 têm prova na própria camada e uma na fronteira.

## Test policy

O repositório diz onde ficam os testes e como rodá-los, mas não diz em que nível cada tipo de código é provado nem quanto da tabela de decisão conta.

| Code                                                                                              | Required proofs                                               | Coverage expectation                                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Decide, alcançado por fronteira HTTP (schema do corpo, guard, cadastro)                           | uma na fronteira **e** uma na própria camada quando há tabela | o contrato na fronteira; um caso por linha da tabela na camada |
| Decide, sem fronteira (pipe, geocodificador, conversão de horário, mapa de erro, ramos do painel) | uma na própria camada                                         | um caso por linha da tabela                                    |
| Entrada que não decide (controller, rota do Next, página que só renderiza)                        | uma na fronteira                                              | entrada aceita, cada recusa, cada erro                         |
| Repasse (`proxyToApi`, módulo)                                                                    | nenhuma própria                                               | coberto pela prova do consumidor                               |

Evidence:

- `clinicSignUpBodySchema`: 7 campos, 4 limites de faixa, refine de ordem e de sobreposição -> decide
- `ClinicGuard`: 3 ramos (sem perfil, com perfil, sessão ausente já barrada antes) -> decide
- `ClinicSignUpService`: CNES prévio, geocodificação (3 saídas), escrita com compensação -> decide
- análogo no repositório: `apps/api/src/modules/vacancies/vacancy-transitions.test.ts` (tabela na camada) + `vacancies.service.test.ts` (fronteira com banco real), HACK-29

Cost: 7 provas na própria camada (CT ×2, PIPE, GEO ×3, WEB ×4 contando C27 a C30) em 6 arquivos de teste.

## Swept

- validation: C2, C3, C4, C5, C6
- failure modes: C7, C9, C10, C30
- idempotency: n/a - cadastro não é idempotente por desenho; repetição cai em e-mail repetido (C9) ou CNES repetido (C10), sem efeito duplicado
- authorization: C19, C21, C22, C23, C24, C25 (guard global do Better Auth existente para o 401, `@Roles` e `ClinicGuard` novos)
- concurrency: C11
- data lifecycle: C11 (compensação apaga o `User` perdedor, cascade em `Session`/`Account`); conta `clinica` antiga sem perfil: C24
- dependency failure: C8, C13, C16, C30
- state transitions: n/a - o card não muda estado de vaga nem de conta; só cria `User`/`Clinic` e lê
- observability: C13, C14, C38

## Out of scope

- Ver `## Out of scope` do plano.

## Handoff

- S1 = 24k (contratos, pipe, módulo de clínicas, harness e 4 testes do HACK-12); S2 entra no módulo de clínicas a 32k; S3 entra no Next a 44k; S4 sem arquivo próprio. Total ~44k (`wc -c` dos arquivos existentes tocados = 75 KB, mais ~100 KB estimados de código e teste novos, ÷ 4), abaixo do orçamento de 150k - um construtor.
- Mechanism: one builder (abaixo do orçamento, sem pergunta).

- **Boundary:** C1-C38 fechados em `7c057bf` (um construtor; provas verdes: API 201/201, web 17/17, contratos 10/10, `npm run check` 0, `npm run build` 0, `npm run smoke` 0, portal P1-P6 em `portal.md`)
- **Settled mid-build:** `GEOCODER_MIN_INTERVAL_MS` (Maestro, aprovação dos checks); rota `POST /api/sign-up/clinica` no `ClinicSignUpController` do `ClinicsModule` (adendo à porta 1, evita dependência circular com o `AuthModule`); espaçamento conta do fim da chamada anterior, com chamadas em série, e sem fila quando o intervalo é 0; `isUniqueViolation` extraído para `apps/api/src/prisma/prisma-errors.ts` (segunda ocorrência)
- **Abandoned:** espaçar pelo início da chamada (o C16 mediu 966 ms de chegada entre a 2ª e a 3ª); fila também com intervalo 0 (serializava a corrida do C11)
