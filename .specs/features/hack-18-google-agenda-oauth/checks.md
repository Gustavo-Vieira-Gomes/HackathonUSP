# HACK-18 · Conectar Google Agenda por OAuth checks

Profile: standard
Plan: `.specs/features/hack-18-google-agenda-oauth/plan.md`

Perfil `standard` e não `light`: o card guarda um segredo de longa duração (refresh token, acesso permanente à agenda com nome de paciente, RN-06), tem cifra com AAD, um state consumido uma vez sob corrida e uma tabela de decisão de erro do Google que o HACK-19 reusa. Na dúvida entre dois perfis, o mais alto.

49 checks em 5 fatias (C47 a C49 do retrabalho da verificação) · 7 portas de uma via · 2 perguntas abertas, das quais 1 bloqueia o build (guard e sessão de clínica do HACK-16 em `main`) e 1 bloqueia só o go-live (credenciais OAuth reais, providenciadas pelo time)

**Decisões do Gustavo que valem aqui:** plano aprovado; código testado só com `GoogleOAuthClient` falso (nenhuma prova chama o Google real); sem `GOOGLE_*` a API responde `503` e a tela diz «indisponível»; revogado e expirado são um status só, `EXPIRED`, com a cópia «a autorização expirou ou foi revogada. Reautorize.».

**Ordem dos portões nas rotas `/api/clinic/google-calendar*`.** Sessão e papel são conferidos antes da configuração: sem sessão `401`, sessão de paciente `403`, sessão de clínica com a integração sem configuração `503`. É a ordem natural do Nest (guard antes do handler) e evita dizer a um anônimo como o ambiente está configurado.

**Como as provas rodam.**

- API, em `apps/api`, com o Postgres do worktree no ar e o `DATABASE_URL` efetivo de `apps/api/.env` lido antes (nunca banco compartilhado), depois de `npx prisma generate && npx tsc -p tsconfig.json --outDir .test-dist` (o mesmo passo do `npm run test`). O `--test-name-pattern` vem **antes** do arquivo. Cada teste começa pelo id do check com o prefixo do card (`H18-C9 - …`), porque `env.test.ts` e `boot.test.ts` já têm `C4`, `C5`… do HACK-12. Abreviações: `RUN` = `node --env-file-if-exists=.env --test`; `ENV` = `.test-dist/config/env.test.js`; `BOOT` = `.test-dist/config/boot.test.js`; `HTTP` = `.test-dist/modules/google-calendar/google-calendar.http.test.js` (API real em porta efêmera por `startTestApp`, com o provider `GoogleOAuthClient` trocado por um falso que conta chamadas e devolve o que o teste manda); `SVC` = `.test-dist/modules/google-calendar/google-calendar-connection.service.test.js` (serviço do módulo real contra o Postgres, mesmo cliente falso); `CRY` = `.test-dist/modules/google-calendar/token-cipher.test.js`; `GOC` = `.test-dist/modules/google-calendar/google-oauth.client.test.js` (o adaptador real com `googleapis`, sem rede externa: URL montada localmente e servidor HTTP local de teste).
- Web, em `apps/web`: `npx tsx --conditions=react-server --test --test-name-pattern="^C<n> " <arquivo>`. A API é o `startFakeApi` de `core/shared/services/fake-api.test-helper.ts`. Abreviações: `WCB` = `core/modules/clinic-calendar/google-calendar-callback.test.ts` (route handler do callback); `WVM` = `core/modules/clinic-calendar/clinic-calendar-view.test.ts` (o que a tela decide mostrar, a partir da resposta da API e do `?google=`); `WACT` = `core/modules/clinic-calendar/clinic-calendar-actions.test.ts` (os serviços que as Server Actions chamam). Os testes do web ficam em `core/**` porque é o que o `npm run test` do web roda.
- Smoke: `npm run smoke` (`scripts/smoke.mjs`), Next e Nest de pé com o Postgres do worktree e **sem** variáveis `GOOGLE_*`; cada asserção nova leva o id do check na mensagem.
- Fake de tempo e de corrida: validade do state movida no banco (nunca `sleep`); corrida sincronizada por promessa liberada pelo próprio cliente falso (L-003).

## Checks

### S1 - configuração e indisponibilidade · 6 arquivos · ~30 KB · ~8k

**C1** - `loadEnv` com exatamente uma ou três das quatro variáveis `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY` preenchidas lança `EnvValidationError`; a mensagem cita o nome de cada variável faltante e não contém nenhum dos valores preenchidos (S1, AC 1)
Proof: `RUN --test-name-pattern="^H18-C1 " ENV` (tabela: cada variável sozinha = 4 casos, cada variável faltando = 4 casos)

**C2** - Com as outras três válidas, `GOOGLE_TOKEN_ENCRYPTION_KEY` que decodifica para 31 bytes, para 33 bytes, ou que não é base64 lança `EnvValidationError` citando `GOOGLE_TOKEN_ENCRYPTION_KEY` e sem o valor; 32 bytes em base64 passa (S1, AC 1)
Proof: `RUN --test-name-pattern="^H18-C2 " ENV` (4 casos)

**C3** - `loadEnv` sem nenhuma `GOOGLE_*` (ausentes e as quatro como string vazia) passa e marca a integração como indisponível; com as quatro válidas passa e marca como disponível (S1, AC 2)
Proof: `RUN --test-name-pattern="^H18-C3 " ENV`

**C4** - O `main.js` compilado com só `GOOGLE_OAUTH_CLIENT_ID` preenchida sai com código diferente de 0 antes de escutar a porta, e a saída de erro cita `GOOGLE_OAUTH_CLIENT_SECRET` e não contém o valor do client id (S1, AC 1)
Proof: `RUN --test-name-pattern="^H18-C4 " BOOT`

**C5** - Com a API de teste sem nenhuma `GOOGLE_*`, `GET /health` responde `200` e, com cookie de sessão de clínica, as cinco rotas (`GET /api/clinic/google-calendar`, `POST .../connect`, `GET .../callback?code=x&state=y`, `GET .../calendars`, `PUT .../calendar`) respondem `503` com corpo `{ code: 'GOOGLE_CALENDAR_UNAVAILABLE', message }`; o cliente Google falso recebe 0 chamadas (S1, AC 2)
Proof: `RUN --test-name-pattern="^H18-C5 " HTTP` (tabela sobre as 5 rotas)

**C6** - Resposta da API `503` com `GOOGLE_CALENDAR_UNAVAILABLE` faz a tela mostrar «Integração com a Google Agenda indisponível neste ambiente» e não oferecer o botão «Conectar Google Agenda» nem a lista de agendas (S1, AC 3)
Proof: `npx tsx --conditions=react-server --test --test-name-pattern="^H18-C6 " WVM`
Proof: `npm run smoke` (asserção `H18-C6`: HTML de `/clinica/agenda` com cookie de clínica contém o texto e não contém «Conectar Google Agenda»)

### S2 - autorizar com state ligado à sessão · 9 arquivos · ~55 KB · ~14k

**C7** - `GoogleOAuthClient.buildAuthUrl(state)` devolve URL de `accounts.google.com` cuja query tem `access_type=offline`, `prompt=consent`, `include_granted_scopes=false`, `response_type=code`, `client_id` e `redirect_uri` iguais às variáveis, `state` igual ao argumento e `scope` com exatamente os dois escopos `https://www.googleapis.com/auth/calendar.events.owned` e `https://www.googleapis.com/auth/calendar.calendarlist.readonly` (S2, AC 4; portas 6 e 7)
Proof: `RUN --test-name-pattern="^H18-C7 " GOC`

**C8** - Clínica logada chama `POST /api/clinic/google-calendar/connect` e recebe `200` com `authorizationUrl`; o `state` passado ao `buildAuthUrl` falso tem 43 caracteres de `[A-Za-z0-9_-]`; a linha `CalendarConnection` da clínica tem `oauthStateHash` = SHA-256 desse state (diferente do state), `oauthStateSessionId` = `session.id` do cookie e `oauthStateExpiresAt` entre agora + 9 min 55 s e agora + 10 min 5 s; um segundo `connect` troca o hash (um state pendente por clínica) (S2, AC 4)
Proof: `RUN --test-name-pattern="^H18-C8 " HTTP`

**C9** - Sem cookie as cinco rotas respondem `401`; com cookie de sessão de paciente respondem `403`; nos dois casos o cliente falso recebe 0 chamadas e nenhuma linha `CalendarConnection` é criada (S2, AC 5)
Proof: `RUN --test-name-pattern="^H18-C9 " HTTP` (tabela: 5 rotas × 2 sessões, com a integração configurada)

**C10** - Callback com o `state` devolvido pelo `connect`, mesma clínica e mesma sessão, dentro da validade, com o falso devolvendo refresh e access token: `exchangeCode` é chamado 1 vez com o `code` da query; a linha fica com status `AWAITING_CALENDAR`, os dois tokens no formato da porta 2 que decifram para os valores do falso, `oauthStateHash`, `oauthStateSessionId` e `oauthStateExpiresAt` nulos; a resposta é `302` com `Location` igual a `{WEB_ORIGIN}/clinica/agenda?google=awaiting_calendar` (S2, AC 6)
Proof: `RUN --test-name-pattern="^H18-C10 " HTTP`

**C11** - Callback com state inválido responde `302` para `{WEB_ORIGIN}/clinica/agenda?google=invalid_state`, `exchangeCode` recebe 0 chamadas e status e tokens ficam iguais aos de antes, em 5 casos: sem `state` na query; state que nunca foi gerado; state com `oauthStateExpiresAt` movido para 1 s no passado; state já consumido por um callback que deu certo; state gerado por outra sessão da mesma conta de clínica (S2, AC 7)
Proof: `RUN --test-name-pattern="^H18-C11 " HTTP` (tabela sobre os 5 casos, partindo de uma conexão `CONNECTED` com tokens para ver que nada muda)

**C12** - Clínica A gera o state; o callback chega com o cookie da Clínica B e esse state: `302` com `google=invalid_state`, `exchangeCode` 0 chamadas, a linha da A continua com o state pendente e o status de antes e a B continua sem linha (S2, AC 8)
Proof: `RUN --test-name-pattern="^H18-C12 " HTTP`

**C13** - Dois callbacks com o mesmo state válido, disparados juntos, com o `exchangeCode` falso retido até os dois pedidos terem chegado ao serviço: `exchangeCode` é chamado 1 vez; uma resposta tem `google=awaiting_calendar` e a outra `google=invalid_state`; a linha termina `AWAITING_CALENDAR` com um único par de tokens (S2, AC 9)
Proof: `RUN --test-name-pattern="^H18-C13 " HTTP`

**C14** - Callback com `error=access_denied` e state válido, partindo de `CONNECTED` com tokens: `302` com `google=denied`, `exchangeCode` 0 chamadas, state zerado, status, tokens e agenda iguais aos de antes (S2, AC 10)
Proof: `RUN --test-name-pattern="^H18-C14 " HTTP`

**C15** - Troca do `code` que devolve só access token (sem refresh): `302` com `google=no_refresh_token`; nenhuma coluna de token muda e o status fica o de antes (S2, AC 11)
Proof: `RUN --test-name-pattern="^H18-C15 " HTTP`

**C16** - `exchangeCode` falso que lança o erro traduzido de falha do Google e o de timeout: nos dois casos `302` com `google=google_unavailable`, nenhuma coluna de token muda e o status fica o de antes (S2, AC 12)
Proof: `RUN --test-name-pattern="^H18-C16 " HTTP` (2 casos)

**C17** - Reconectar: a partir de `CONNECTED`, `POST .../connect` responde `200` e deixa status, tokens e agenda intactos; o callback que dá certo troca os dois tokens pelos novos e o status volta a `AWAITING_CALENDAR` (S2; Assumptions, reconectar com conexão ativa)
Proof: `RUN --test-name-pattern="^H18-C17 " HTTP`

**C18** - Route handler `GET /api/google-calendar/callback` do Next: com cookie, repassa `code`, `state` e `error` e o cookie para `GET /api/clinic/google-calendar/callback` da API e devolve `302` com o mesmo `Location` da API; sem cookie de sessão responde `302` para `/clinica/login` sem chamar a API; API fora do ar responde `502`; API que não responde em `API_PROXY_TIMEOUT_MS` responde `504` (S2; Surface, rota do Next)
Proof: `npx tsx --conditions=react-server --test --test-name-pattern="^H18-C18 " WCB` (4 casos)

**C19** - O serviço da Server Action de conectar, com a API falsa devolvendo `200` e `authorizationUrl`, devolve essa URL para o redirect; com `503` devolve o estado indisponível; com `200` fora do contrato (sem `authorizationUrl` ou URL inválida) devolve erro e nenhuma URL (S2, AC 4 e AC 3 do lado do Next)
Proof: `npx tsx --conditions=react-server --test --test-name-pattern="^H18-C19 " WACT` (3 casos)

### S3 - escolher a agenda e ver o status · 9 arquivos · ~50 KB · ~13k

**C20** - Clínica em `AWAITING_CALENDAR` e em `CONNECTED` chama `GET .../calendars`, com o falso devolvendo agendas de `accessRole` `owner` (uma primária, não primeira), `writer`, `reader` e `freeBusyReader`: `200` com `calendars` só das `owner`, cada item com exatamente `id`, `name` e `primary`, a primária primeiro e as outras na ordem do Google (S3, AC 13; Observable, densidade e ordem)
Proof: `RUN --test-name-pattern="^H18-C20 " HTTP` (2 status)

**C21** - `GET .../calendars` e `PUT .../calendar` com a clínica sem linha (`DISCONNECTED`) e com status `EXPIRED` respondem `409` com `code` `CALENDAR_NOT_AUTHORIZED`, o falso com 0 chamadas e a linha igual (S3, AC 14)
Proof: `RUN --test-name-pattern="^H18-C21 " HTTP` (2 rotas × 2 status)

**C22** - `PUT .../calendar` com `{ calendarId }` de uma agenda `owner` da lista: `200` com `status` `connected`, `calendarName` igual ao nome da agenda e `connectedAt`; a linha tem o id e o nome da agenda e status `CONNECTED` (S3, AC 15)
Proof: `RUN --test-name-pattern="^H18-C22 " HTTP`

**C23** - `PUT .../calendar` com `calendarId` fora da lista e com `calendarId` de agenda `writer` da conta responde `422` com `code` `CALENDAR_NOT_AVAILABLE`; corpo sem `calendarId`, com `calendarId` `''` e com `calendarId` numérico responde `422` com `code` `VALIDATION_FAILED` e `fields` igual a `['calendarId']` (`ZodBodyPipe` do HACK-16) e o falso recebe 0 chamadas; a linha fica igual nos 5 casos (S3, AC 16)
Proof: `RUN --test-name-pattern="^H18-C23 " HTTP` (5 casos)

**C24** - Com o falso de listagem lançando o erro de credencial recusada (`invalid_grant` e `401`), `GET .../calendars` e `PUT .../calendar` respondem `409` com `CALENDAR_NOT_AUTHORIZED`, e a linha fica `EXPIRED` com os dois tokens nulos (S3, AC 17)
Proof: `RUN --test-name-pattern="^H18-C24 " HTTP` (2 erros × 2 rotas)

**C25** - Com o falso de listagem lançando o erro traduzido de falha do Google, `GET .../calendars` e `PUT .../calendar` respondem `502` com `code` `GOOGLE_UNAVAILABLE`; com o de timeout respondem `504` com `code` `GOOGLE_TIMEOUT`; a linha fica igual nos quatro casos (S3, AC 18)
Proof: `RUN --test-name-pattern="^H18-C25 " HTTP` (2 erros × 2 rotas)

**C26** - `GET /api/clinic/google-calendar` responde `200` e o corpo passa no schema do contrato em cada status: sem linha `{ status: 'disconnected' }`; `AWAITING_CALENDAR` `{ status: 'awaiting_calendar' }`; `CONNECTED` com `calendarName` e `connectedAt`; `EXPIRED` com `status` `expired` (S3; Surface, `GET` de status)
Proof: `RUN --test-name-pattern="^H18-C26 " HTTP` (4 status)

**C27** - A tela decide, por status recebido: `connected` mostra «Conectada» e o nome da agenda, sem botão de conectar; `disconnected` mostra «Desconectada» e o botão «Conectar Google Agenda»; `expired` mostra «Agenda desconectada: a autorização expirou ou foi revogada. Reautorize.» e o botão «Conectar Google Agenda»; `awaiting_calendar` com agendas mostra uma opção de rádio com label por agenda, na ordem recebida, e o botão «Usar esta agenda» (S3, AC 19 a AC 22)
Proof: `npx tsx --conditions=react-server --test --test-name-pattern="^H18-C27 " WVM` (4 status)

**C28** - `awaiting_calendar` com a lista vazia mostra «Nenhuma agenda própria encontrada nesta conta Google» e nenhum botão «Usar esta agenda» (S3, AC 22)
Proof: `npx tsx --conditions=react-server --test --test-name-pattern="^H18-C28 " WVM`

**C29** - Ao carregar o status, API fora do ar, resposta `500` e `200` com corpo fora do contrato (`status: 'conectada'`) fazem a tela mostrar «Não foi possível carregar o status da agenda. Tente de novo.» e nenhum dos quatro textos de status (S3, AC 23)
Proof: `npx tsx --conditions=react-server --test --test-name-pattern="^H18-C29 " WVM` (3 casos)

**C30** - `?google=denied`, `invalid_state`, `no_refresh_token` e `google_unavailable` produzem, cada um, uma mensagem de alerta diferente das outras três e não vazia; `?google=awaiting_calendar`, valor desconhecido e ausência do parâmetro não produzem alerta (S3, AC 24)
Proof: `npx tsx --conditions=react-server --test --test-name-pattern="^H18-C30 " WVM` (7 casos)
Proof: `npm run smoke` (asserção `H18-C30`: HTML de `/clinica/agenda?google=denied` com cookie de clínica tem `role="alert"` com a mensagem de `denied`)

**C31** - O serviço da Server Action de escolher envia `PUT .../calendar` com `{ calendarId }` e o cookie; `200` dentro do contrato é sucesso; `409`, `422` (`CALENDAR_NOT_AVAILABLE` e `VALIDATION_FAILED`), `502` e `504` devolvem erro com o `code` da API e nunca sucesso (S3, AC 15 e AC 16 do lado do Next)
Proof: `npx tsx --conditions=react-server --test --test-name-pattern="^H18-C31 " WACT` (6 casos)

**C32** - Sem cookie, `GET /clinica/agenda` no Next redireciona para `/clinica/login` (S3; Observable, não autorizado)
Proof: `npm run smoke` (asserção `H18-C32`)

### S4 - tokens nunca saem do módulo · 4 arquivos · ~20 KB · ~5k

**C33** - No fluxo completo (connect, callback que dá certo, calendars, PUT, GET de status) e nos callbacks de erro de C11, C14 a C16, nenhum corpo de resposta e nenhum `Location` contém o refresh token, o access token, o `code` nem o state usados pelo teste (S4, AC 25)
Proof: `RUN --test-name-pattern="^H18-C33 " HTTP`

**C34** - Lidas cruas por `$queryRaw` (`SELECT * FROM` a tabela), as colunas de token casam `^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$` e nenhuma coluna da linha contém o refresh nem o access token em texto puro (S4, AC 26; porta 2)
Proof: `RUN --test-name-pattern="^H18-C34 " HTTP`

**C35** - A cifra decifra o que cifrou com o mesmo `clinicId`; duas cifras do mesmo texto diferem (IV aleatório); lança erro, sem devolver texto, quando decifrada com o `clinicId` de outra clínica, com o IV adulterado, com a tag adulterada, com a cifra adulterada e com prefixo `v2.`; chave de 32 bytes vem de `GOOGLE_TOKEN_ENCRYPTION_KEY` (S4, AC 27; porta 2)
Proof: `RUN --test-name-pattern="^H18-C35 " CRY` (1 ida e volta, 1 IV, 5 recusas)

**C36** - Com o `Logger` capturado, nas falhas de C16, C24 e C25, cujos erros falsos carregam um objeto no formato do erro do `googleapis` com `config.headers.Authorization: 'Bearer <token>'` e `config.data` com o `code` e o refresh token: o texto registrado contém o `code` traduzido e o status HTTP, e não contém o token, o `code` OAuth, o state, `Bearer` nem `Authorization` (S4, AC 28)
Proof: `RUN --test-name-pattern="^H18-C36 " HTTP`

**C37** - O adaptador traduz um `GaxiosError` real (com `config.headers.Authorization` e `config.data`) para um erro próprio cujo `JSON.stringify` e `String()` não contêm o token nem o corpo da requisição; nos casos `invalid_grant`, `401`, `500`, `403` e erro de rede (S4, AC 28; porta 4)
Proof: `RUN --test-name-pattern="^H18-C37 " GOC` (5 casos)

### S5 - API para o sincronizador · 6 arquivos · ~35 KB · ~9k

**C38** - `getAuthorizedCalendar(clinicId)` de uma clínica `CONNECTED` devolve `calendarId` igual ao escolhido e o `calendar` que o `calendarFor` falso montou; o falso recebeu credenciais com o refresh e o access token decifrados e a validade gravada (S5, AC 29; porta 3)
Proof: `RUN --test-name-pattern="^H18-C38 " SVC`

**C39** - `calendarFor` real devolve um `calendar_v3.Calendar` cujas chamadas, contra um servidor HTTP local que nunca responde, rejeitam com o erro traduzido de timeout entre 10 s e 12 s; o mesmo vale para `exchangeCode` e `listOwnedCalendars` (S5, AC 29; S2, AC 12; S3, AC 18; Assumptions, timeout do `googleapis`)
Proof: `RUN --test-name-pattern="^H18-C39 " GOC` (3 chamadas; o Construtor confirma na versão instalada como apontar `googleapis` para o servidor local - `rootUrl` / endpoints do `OAuth2Client`; sem forma documentada, para e pergunta ao Maestro)

**C40** - `getAuthorizedCalendar` de clínica sem linha, em `AWAITING_CALENDAR` e em `EXPIRED` lança `CalendarNotConnectedError` e o falso recebe 0 chamadas (S5, AC 30)
Proof: `RUN --test-name-pattern="^H18-C40 " SVC` (3 casos)

**C41** - Quando o cliente devolvido dispara o `onTokens` com novo access token e nova validade, a coluna do access token passa a decifrar para o novo, a validade é a nova e o refresh token decifra para o mesmo de antes (S5, AC 31)
Proof: `RUN --test-name-pattern="^H18-C41 " SVC`

**C42** - `markCredentialsRejected(clinicId)` numa clínica `CONNECTED` deixa status `EXPIRED`, os dois tokens nulos e id e nome da agenda iguais; a segunda chamada deixa a linha idêntica e não lança (S5, AC 32)
Proof: `RUN --test-name-pattern="^H18-C42 " SVC`

**C43** - `isCredentialsRejectedError` devolve `true` para o erro do Google com `invalid_grant` e para o com status `401`, e `false` para `403`, `500`, erro de rede, timeout, `Error` comum, `null` e string (S5, AC 33)
Proof: `RUN --test-name-pattern="^H18-C43 " GOC` (tabela, 9 casos)

**C44** - Revogação: `calendar` do falso lança `invalid_grant`; `isCredentialsRejectedError` desse erro é `true`; depois de `markCredentialsRejected`, `GET /api/clinic/google-calendar` da clínica responde `status` `expired` (S5, AC 33)
Proof: `RUN --test-name-pattern="^H18-C44 " HTTP`

**C45** - `listConnectedClinicIds()`, com quatro clínicas de teste em `DISCONNECTED` (sem linha), `AWAITING_CALENDAR`, `CONNECTED` e `EXPIRED`, devolve entre os ids dessas quatro só o da `CONNECTED` (S5, AC 34)
Proof: `RUN --test-name-pattern="^H18-C45 " SVC`

**C46** - Esquema e módulo: o enum `CalendarConnectionStatus` tem exatamente `DISCONNECTED`, `AWAITING_CALENDAR`, `CONNECTED`, `EXPIRED`; uma segunda linha para o mesmo `clinicId` falha por unicidade; apagar a `Clinic` apaga a linha; um módulo de teste que importa `GoogleCalendarModule` resolve `GoogleCalendarConnectionService` e chama os quatro nomes da porta 3; `googleapis` é importado só por `google-oauth.client.ts` (`GoogleOAuthClient`) e está em `apps/api/package.json` e no lock (portas 1, 3, 4 e 5)
Proof: `RUN --test-name-pattern="^H18-C46 " SVC`
Proof: `test -z "$(grep -rl --include='*.ts' "from 'googleapis'" apps/api/src | grep -v 'google-oauth.client.ts$')"` (da raiz)
Proof: `npm ls googleapis -w @hackathon/api` (da raiz; sai 0 só com a dependência no lock)

### Retrabalho da verificação (Maestro, 08/11) · 5 arquivos · ~20 KB · ~5k

**C47** - Callback com state válido, partindo de `CONNECTED` com tokens, em 2 casos: `error=server_error` (diferente de `access_denied`) e sem `code` nem `error`: `302` com `google=google_unavailable`, `exchangeCode` 0 chamadas, state zerado, status, tokens e agenda iguais aos de antes (S2; L-006; bloqueio de `verification.md`)
Proof: `RUN --test-name-pattern="^H18-C47 " HTTP` (2 casos)

**C48** - Em `awaiting_calendar` com a lista de agendas vazia e com erro ao listar, a tela oferece o botão «Conectar Google Agenda» para reautorizar com outra conta; com agendas na lista, não oferece (S3, AC 22; decisão do Maestro, R3)
Proof: `npx tsx --conditions=react-server --test --test-name-pattern="^H18-C48 " WVM` (3 casos)

**C49** - Quando o Google renova o access token durante `GET .../calendars` (clínica em `AWAITING_CALENDAR`), a coluna do access token passa a decifrar para o novo e a validade é a nova, pelo mesmo caminho do `getAuthorizedCalendar` (C41); o refresh token decifra para o mesmo de antes (S3; R6)
Proof: `RUN --test-name-pattern="^H18-C49 " HTTP`

## Coverage

| Set (size)                                                                       | Member -> proof                                                                                                                                                                                                             | Unproven |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `GET /api/clinic/google-calendar` statuses (4)                                   | 200 C26 · 401 C9 · 403 C9 · 503 C5                                                                                                                                                                                          | -        |
| `POST /api/clinic/google-calendar/connect` statuses (4)                          | 200 C8 · 401 C9 · 403 C9 · 503 C5                                                                                                                                                                                           | -        |
| `GET /api/clinic/google-calendar/callback` statuses (4)                          | 302 C10 · 401 C9 · 403 C9 · 503 C5                                                                                                                                                                                          | -        |
| `GET /api/clinic/google-calendar/calendars` statuses (7)                         | 200 C20 · 401 C9 · 403 C9 · 409 C21 · 502 C25 · 503 C5 · 504 C25                                                                                                                                                            | -        |
| `PUT /api/clinic/google-calendar/calendar` statuses (8)                          | 200 C22 · 401 C9 · 403 C9 · 409 C21 · 422 C23 · 502 C25 · 503 C5 · 504 C25                                                                                                                                                  | -        |
| `GET /api/google-calendar/callback` (Next) statuses (3)                          | 302 C18 · 502 C18 · 504 C18                                                                                                                                                                                                 | -        |
| resultados `google=` do callback (5)                                             | `awaiting_calendar` C10 · `denied` C14 · `invalid_state` C11 · `no_refresh_token` C15 · `google_unavailable` C16, C47                                                                                                       | -        |
| state recusado (6)                                                               | ausente C11 · desconhecido C11 · vencido C11 · consumido C11 · outra sessão C11 · outra clínica C12                                                                                                                         | -        |
| `code` de erro do Nest (7)                                                       | `GOOGLE_CALENDAR_UNAVAILABLE` C5 · `403` do `@ClinicOnly()` C9 · `CALENDAR_NOT_AUTHORIZED` C21 · `CALENDAR_NOT_AVAILABLE` C23 · `VALIDATION_FAILED` C23 · `GOOGLE_UNAVAILABLE` C25 · `GOOGLE_TIMEOUT` C25                   | -        |
| `CalendarConnectionStatus` no `GET` de status (4)                                | `DISCONNECTED` C26 · `AWAITING_CALENDAR` C26 · `CONNECTED` C26 · `EXPIRED` C26                                                                                                                                              | -        |
| transições de status (6)                                                         | sem linha → `AWAITING_CALENDAR` C10 · `CONNECTED` → `AWAITING_CALENDAR` C17 · `AWAITING_CALENDAR` → `CONNECTED` C22 · `CONNECTED` → `EXPIRED` C42 · listagem recusada → `EXPIRED` C24 · `EXPIRED` → `AWAITING_CALENDAR` C17 | -        |
| estados da tela, 4 status, indisponível e erro de carga (6)                      | `connected` C27 · `disconnected` C27 · `expired` C27 · `awaiting_calendar` C27, C28, C48 · indisponível C6 · erro C29                                                                                                       | -        |
| `?google=` na tela, 4 de erro e 3 sem alerta (7)                                 | `denied` C30 · `invalid_state` C30 · `no_refresh_token` C30 · `google_unavailable` C30 · `awaiting_calendar` C30 · desconhecido C30 · ausente C30                                                                           | -        |
| variáveis `GOOGLE_*` (4)                                                         | `GOOGLE_OAUTH_CLIENT_ID` C1 · `GOOGLE_OAUTH_CLIENT_SECRET` C1 · `GOOGLE_OAUTH_REDIRECT_URI` C1 · `GOOGLE_TOKEN_ENCRYPTION_KEY` C1, C2                                                                                       | -        |
| tamanho da chave (4 bordas)                                                      | 31 bytes C2 · 32 bytes C2 · 33 bytes C2 · não base64 C2                                                                                                                                                                     | -        |
| erros do Google classificados (5)                                                | `invalid_grant` C43 · `401` C43 · `403` C43 · `500` C43 · rede/timeout C43, C39                                                                                                                                             | -        |
| adulteração do token cifrado (5)                                                 | outra clínica C35 · IV C35 · tag C35 · cifra C35 · prefixo C35                                                                                                                                                              | -        |
| API de módulo, porta 3 (4)                                                       | `getAuthorizedCalendar` C38, C40 · `markCredentialsRejected` C42 · `listConnectedClinicIds` C45 · `isCredentialsRejectedError` C43                                                                                          | -        |
| chamadas ao Google com timeout (3)                                               | `exchangeCode` C39 · `listOwnedCalendars` C39 · `calendarFor` C39                                                                                                                                                           | -        |
| portas de uma via em `Landing` (7)                                               | porta 1 C46 · porta 2 C34, C35 · porta 3 C46 · porta 4 C46 · porta 5 C46 · porta 6 C7 · porta 7 C7                                                                                                                          | -        |
| ramos do callback com state válido (5)                                           | `error=access_denied` C14 · outro `error` C47 · sem `code` C47 · troca sem refresh C15 · troca com falha C16                                                                                                                | -        |
| quem grava o access token renovado (2)                                           | `getAuthorizedCalendar` C41 · listagem de agendas C49                                                                                                                                                                       | -        |
| startup config: env das `GOOGLE_*` (2 montagens)                                 | `main.js` C4 · `startTestApp` C5                                                                                                                                                                                            | -        |
| startup config: `GoogleCalendarModule` no `AppModule` (1 montagem compartilhada) | `createApp`, usada por `main.ts` e `startTestApp` C5                                                                                                                                                                        | -        |

- Afirmações com status HTTP, `code` ou `Location`: C5, C8 a C17, C20 a C26, C33, C44 - todas pelo `HTTP`, que cruza o limite real (guard, pipe, controller, serviço, Postgres), com só o Google falso.
- As decisões do adaptador (URL, tradução de erro, classificação, timeout) são provadas na própria camada (C7, C37, C39, C43), porque o `HTTP` troca o adaptador inteiro pelo falso e nunca as exercita.
- Os textos da tela são provados na função que decide o que mostrar (`WVM`); o smoke prova que a página real monta essa decisão em dois pontos (C6, C30) e o redirect sem sessão (C32).
- Nenhum outro check afirma mais do que o caso que a sua prova exercita.

## Test policy

| Code                                                                                                        | Required proofs                                                                             | Coverage expectation                                            |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Decide, alcançado pelo HTTP (`google-calendar-connection.service.ts`: state, status, troca, escolha, erros) | integração no limite (`HTTP`) contra o Postgres                                             | um caso afirmado por ramo: C8 a C17, C20 a C26                  |
| Decide, consumido pelo HACK-19 sem HTTP (porta 3)                                                           | na própria camada (`SVC`)                                                                   | um caso por método e por status de entrada: C38, C40 a C42, C45 |
| Decide, isolado do HTTP pelo falso (`google-oauth.client.ts`)                                               | na própria camada (`GOC`), sem Google real                                                  | URL, 5 traduções, 9 classificações, 3 timeouts                  |
| Decide, pura (`token-cipher.ts`, validação de env, `clinic-calendar-view.ts`)                               | na própria camada                                                                           | uma por linha da tabela: C1 a C3, C35, C27 a C30                |
| Instrumentação (`google-calendar.module.ts`, controller fino, route handler, Server Actions)                | pelo consumidor; route handler e serviços das actions têm `WCB`/`WACT` por decidirem status | C18, C19, C31                                                   |

Evidence:

- `google-calendar-connection.service.ts` (a escrever): ramos - sem configuração, sem linha, state ausente/desconhecido/vencido/consumido/outra sessão, `error` do Google, sem refresh token, falha/timeout na troca, status permitido para listar/escolher, id fora da lista, credencial recusada × outra falha × timeout, `onTokens`, idempotência do `markCredentialsRejected` -> decide
- `google-oauth.client.ts`: tradução de erro com 5 saídas e classificação com 2 positivos -> decide
- análogos no repo: `src/modules/vacancies/vacancies.service.test.ts` (serviço contra Postgres, corrida por sinal) e `src/auth/session.test.ts` (HTTP por `startTestApp`); no web, `core/shared/services/api-proxy.test.ts` com `startFakeApi`

Cost: 46 checks em 9 arquivos de teste. Sem estas linhas, a tradução de erro do Google e o timeout seriam provados só por um falso que já lança o erro pronto (L-001), e nunca pelo adaptador real.

## Swept

- validação: C1, C2, C11, C23
- modos de falha: C15, C16, C25, C29
- idempotência: C13 (state consumido uma vez), C42 (`markCredentialsRejected` repetido)
- autorização: C9, C12 - `@ClinicOnly()` + `@CurrentClinicId()` do HACK-16, clínica sempre da sessão, nunca de query ou corpo
- concorrência: C13
- ciclo de vida do dado: C17 (reconectar substitui os tokens só depois do callback), C42 (tokens apagados ao expirar), C46 (cascade ao apagar a clínica); não há linha existente a migrar
- falha de dependência: C16, C24, C25, C39 - Google; API fora do ar no Next em C18 e C29
- transições de estado: C10, C17, C22, C24, C42
- observabilidade: C36, C37

Dimensões da casa: tenant - C12 (state de uma clínica não serve a outra) e AAD por clínica em C35; dinheiro - não se aplica, nenhum valor; data - validade do state em relógio real, movida no banco (C11), nunca pelo relógio da demo; schema - porta 1, C46; materializado - não se aplica; fornecedor - Google sempre falso nas provas; contra o Google real só a demo (pergunta aberta 1).

## Handoff

- Lidos: `plan.md` (~22 KB), `env.ts`, `app.ts`/`app.module.ts`, `test-app.ts`, `auth/*` usados (~12 KB), `schema.prisma` (~15 KB), `api-proxy.service.ts` + `fake-api.test-helper.ts` (~5 KB), guard/layout do HACK-16 (~8 KB estimados) ≈ 62 KB. Escritos: S1 ~30 KB, S2 ~55 KB, S3 ~50 KB, S4 ~20 KB, S5 ~35 KB ≈ 190 KB, com o checks.md (~25 KB) ≈ 277 KB / 4 ≈ 69k, abaixo do orçamento de 150k - um construtor, sem pergunta.
- Ordem: build só depois do aviso do Maestro com o HACK-16 em `main` → `git merge origin/main`; `npm install googleapis -w @hackathon/api` com o lock; migration nova (regenerada por cima se HACK-16/17 migrarem antes); `plan.md` e `checks.md` já vão commitados nesta fase (`docs(hack-18): …`).
- Mecanismo: um construtor (dentro do orçamento, sem pergunta).
- **Boundary:** C1-C46 fechados em `c60835c` (base do card `55fdd75`; `origin/main` com o HACK-16 mesclado em `dfebbd9`).
- **Settled mid-build:** seletores das provas com prefixo `H18-` (`env.test.ts` e `boot.test.ts` já têm `C4`, `C5` do HACK-12); o falso do `GoogleOAuthClient` troca os métodos da instância do app (`mock.method`, padrão do `realtime-handshake.test.ts`), não o provider no módulo; C33: o state sai, por desenho do OAuth, dentro da `authorizationUrl` do `connect` (é o canal dele até o Google), e a prova confere ausência de state em todas as outras respostas e de token/`code` em todas; C37: o gaxios 8 já mascara `Authorization` no erro (`errorRedactor`), então o controle passou a ser «erro cru tem `config`/`response`, o traduzido não»; C39: `googleapis` 189 aponta para servidor local por `rootUrl` (calendar) e `endpoints.oauth2TokenUrl` (OAuth2Client), documentados nos `.d.ts`; a biblioteca liga retry nas chamadas de token e da API, e o adaptador zera o retry por interceptor para os 10 s valerem por chamada; migration com timestamp `20261108130000` para ficar depois da `20261108120000` do HACK-13 (o registro local foi renomeado no `_prisma_migrations`, sem reset); Postgres do worktree em `127.0.0.1:54318` (a 5432 era um túnel ssh); `loading.tsx` retirado (ver `plan.md`, Observable «carregando»).
- **Abandoned:** servidor de teste roteando o status pelo caminho (`/401/...`): o `rootUrl` do `googleapis` descarta o caminho, então virou um servidor por status; `loading.tsx` em `/clinica/agenda` (quebrava o redirect sem sessão, C32).
