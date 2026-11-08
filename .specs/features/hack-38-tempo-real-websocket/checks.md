# HACK-38 · tempo real por WebSocket checks

Profile: light
Plan: `.specs/features/hack-38-tempo-real-websocket/plan.md`

32 checks em 5 fatias · 7 portas de uma via · 0 perguntas abertas

Convenções das provas (as mesmas do HACK-12, que este card herda depois do `git merge origin/main` com o 12):

- API: cada teste começa pelo id do check (`C6 - …`). Comando-base, de `apps/api`, com o Postgres do worktree de pé e as migrations aplicadas:
  `npx tsc -p tsconfig.json --outDir .test-dist && node --env-file-if-exists=.env --test --test-name-pattern="^C<n> " .test-dist/<arquivo>.test.js`.
  As provas abaixo assumem `.test-dist` compilado pelo `tsc` acima. Clientes de teste usam `socket.io-client` contra a API real em porta efêmera (`startTestApp` de `src/testing/test-app.ts`), com `extraHeaders: { origin: WEB_ORIGIN }` salvo onde o check diz outra coisa.
- Web: comando-base, de `apps/web`: `npx tsx --conditions=react-server --test --test-name-pattern="^C<n> " <arquivo>.test.ts`. O cliente testado é um módulo TS sem React (com `react-server` o `react` não exporta hooks); o hook é um invólucro fino sobre ele. O servidor é um `socket.io` local de teste; a geração de token é uma função injetada.
- Contratos: de `packages/contracts`, `npx tsx --test --test-name-pattern="^C<n> " src/realtime.test.ts`.
- Smoke: `npm run smoke` (`scripts/smoke.mjs`), Next e Nest de pé com o Postgres do worktree; cada asserção nova leva o id do check na mensagem.
- Banco: só o Postgres local do worktree (`127.0.0.1:54338`, banco `hack_38`). O `DATABASE_URL` efetivo de `apps/api/.env` é lido antes de qualquer prova que abre conexão.
- Tempo de espera para "não recebeu": 300 ms depois de o evento chegar às conexões que deviam recebê-lo (mesmo processo, mesma ordem por conexão).

## Checks

### S1 - conexão autenticada pela sessão · 6 arquivos · ~28 KB · ~7k

**C1** - Pelo Next, `GET /api/auth/one-time-token/generate` com o cookie de um cadastro recém-feito responde `200` com `token` string não vazia; sem cookie responde `401` sem `token`; depois de `POST /api/auth/sign-out` com o mesmo cookie responde `401` (S1, AC 1, AC 2)
Proof: `npm run smoke` (asserções `C1` em `scripts/smoke.mjs`, pelo endereço do Next)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C24 " .test-dist/auth/one-time-token.test.js` (existente do HACK-12, direto no Nest)

**C2** - Handshake em `/realtime` com `auth: { token }` gerado pelo cookie de um `paciente` conecta, e o socket no servidor está exatamente nas salas `{<socket.id>, paciente:<user.id>}` (S1, AC 3)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C2 " .test-dist/modules/realtime/realtime-handshake.test.js`

**C3** - Handshake com `auth: { token }` de um `clinica` conecta e o socket está exatamente nas salas `{<socket.id>, clinica:<user.id>}` (S1, AC 4)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C3 " .test-dist/modules/realtime/realtime-handshake.test.js`

**C4** - Handshake com `auth.token` recusado recebe `connect_error` com `message` `unauthorized` e nenhum socket entra no namespace, em 3 casos: token adulterado (último caractere trocado); token válido cuja linha `Verification` teve `expiresAt` movido para 1 s no passado (gerado há mais de 3 min); token adulterado **com** cookie de sessão válido no header `cookie` do handshake (não cai no cookie) (S1, AC 5)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C4 " .test-dist/modules/realtime/realtime-handshake.test.js` (tabela sobre os 3 casos)

**C5** - O mesmo token usado num segundo handshake, depois de o primeiro conectar, recebe `connect_error` `unauthorized` (S1, AC 6)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C5 " .test-dist/modules/realtime/realtime-handshake.test.js`

**C6** - Handshake sem `auth.token` e com cookie de sessão válido no header `cookie` conecta e fica só na sala do papel: `{<socket.id>, paciente:<id>}` para um paciente e `{<socket.id>, clinica:<id>}` para uma clínica (S1, AC 7)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C6 " .test-dist/modules/realtime/realtime-handshake.test.js`

**C7** - Handshake sem `auth.token` recebe `connect_error` `unauthorized` em 3 casos: sem cookie; cookie adulterado; cookie de sessão encerrada por `POST /api/auth/sign-out` (S1, AC 8)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C7 " .test-dist/modules/realtime/realtime-handshake.test.js` (tabela sobre os 3 casos)

**C8** - Com `AuthSessionService.verifyOneTimeToken` e `AuthSessionService.getSession` substituídos por funções que lançam `Error('db down')`, o handshake com token e o handshake só com cookie recebem `connect_error` `unavailable`; o `Logger` do gateway registra 1 erro por handshake e o texto registrado não contém o token, o valor do cookie nem o e-mail da conta (S1, AC 9)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C8 " .test-dist/modules/realtime/realtime-handshake.test.js` (2 caminhos: token, cookie)

**C9** - Com token válido e cookie válido, o handshake com `Origin: http://evil.example` e o handshake sem `Origin` recebem HTTP `403`, tanto no `GET /socket.io/?EIO=4&transport=polling` quanto no upgrade `transport=websocket`; com `Origin` igual a `WEB_ORIGIN` o mesmo handshake conecta (S1, AC 10)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C9 " .test-dist/modules/realtime/realtime-handshake.test.js` (2 origens recusadas × 2 transportes, mais o controle aceito)

**C10** - Um paciente que conecta com `auth: { token, userId: '<id de outro paciente>', role: 'clinica', room: 'clinica:<id de uma clínica>' }` e query `?userId=<id de outro>&room=clinica:x` fica exatamente em `{<socket.id>, paciente:<seu próprio id>}` (S1, AC 11)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C10 " .test-dist/modules/realtime/realtime-handshake.test.js`

### S2 - página da vaga ao vivo · 4 arquivos · ~22 KB · ~6k

**C11** - Um cliente conectado só por token (sem header `cookie`, como em produção) emite `vaga.assinar { vagaId: 'v1' }` e recebe no ack `{ ok: true }`, e o socket passa a estar na sala `vaga:v1`; o guard global do Better Auth não barra a mensagem (S2, AC 12; Impact "guard global")
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C11 " .test-dist/modules/realtime/realtime-subscriptions.test.js`

**C12** - `vaga.assinar` e `vaga.sair` com `vagaId` `''`, `123`, ausente, `null` ou string de 65 caracteres respondem `{ ok: false, erro: 'payload_invalido' }` e as salas do socket ficam iguais às de antes; `vagaId` de 64 caracteres em `vaga.assinar` responde `{ ok: true }` (S2, AC 13)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C12 " .test-dist/modules/realtime/realtime-subscriptions.test.js` (tabela: 5 entradas inválidas × 2 eventos = 10 casos, mais a borda de 64)

**C13** - Depois de 20 `vaga.assinar` aceitos (`v1`…`v20`), o 21º (`v21`) responde `{ ok: false, erro: 'limite_assinaturas' }` e o socket não está em `vaga:v21`; o 20º respondeu `{ ok: true }` (S2, AC 14)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C13 " .test-dist/modules/realtime/realtime-subscriptions.test.js`

**C14** - Depois de `vaga.assinar { vagaId: 'v1' }` e `vaga.sair { vagaId: 'v1' }` (ack `{ ok: true }`), o socket não está em `vaga:v1` e `RealtimeService.vagaPreco({ vagaId: 'v1', precoCentavos: 100 })` não chega a ele em 300 ms, enquanto chega a outro cliente que segue em `vaga:v1` (S2, AC 15)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C14 " .test-dist/modules/realtime/realtime-subscriptions.test.js`

**C15** - Com os clientes A e B em `vaga:v1` e C em `vaga:v2`, `RealtimeService.vagaPreco({ vagaId: 'v1', precoCentavos: 50400 })` faz A e B receberem `vaga.preco` com `vagaId` `'v1'`, `precoCentavos` `50400` e `em` que passa em `z.iso.datetime()`; C não recebe nada em 300 ms (S2, AC 16)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C15 " .test-dist/modules/realtime/realtime.service.test.js`

**C16** - No mesmo arranjo do C15, `RealtimeService.vagaReservada({ vagaId: 'v1' })` faz A e B receberem `vaga.reservada` cujas chaves são exatamente `['em', 'vagaId']`, e C não recebe nada em 300 ms (S2, AC 17)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C16 " .test-dist/modules/realtime/realtime.service.test.js`

### S3 - alerta do paciente, reserva da clínica e contrato · 4 arquivos · ~16 KB · ~4k

**C17** - Com os pacientes p1, p2 e p3 conectados, `RealtimeService.vagaPublicada({ vagaId: 'v1' }, [p1.id, p2.id])` faz p1 e p2 receberem `vaga.publicada` com `vagaId` `'v1'` e `em` ISO; p3 não recebe nada em 300 ms (S3, AC 18)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C17 " .test-dist/modules/realtime/realtime.service.test.js`

**C18** - Com as clínicas c1 e c2 conectadas, `RealtimeService.reservaCriada(c1.id, { reservaId: 'r1', vagaId: 'v1' })` faz c1 receber `reserva.criada` com `reservaId` `'r1'`, `vagaId` `'v1'` e `em` ISO; c2 não recebe nada em 300 ms (S3, AC 19)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C18 " .test-dist/modules/realtime/realtime.service.test.js`

**C19** - `RealtimeService.vagaPreco` com `precoCentavos` `-1`, `1.5` ou `'50400'`, e `vagaPreco`/`vagaReservada`/`vagaPublicada`/`reservaCriada` com `vagaId` `''`, lançam erro ao chamador e nenhum cliente conectado (em `vaga:v1`, `paciente:<id>` e `clinica:<id>`) recebe evento em 300 ms (S3, AC 20)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C19 " .test-dist/modules/realtime/realtime.service.test.js` (tabela: 3 preços inválidos + 4 métodos com `vagaId` vazio = 7 casos)

**C20** - `vagaPreco` para `vaga:sem-ninguem`, `vagaPublicada` para um paciente sem conexão e `reservaCriada` para uma clínica sem conexão resolvem sem lançar (S3, AC 21)
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C20 " .test-dist/modules/realtime/realtime.service.test.js`

**C21** - `@hackathon/contracts` exporta os schemas dos 4 eventos servidor → cliente, o de `vaga.assinar`/`vaga.sair` e o do ack, com os nomes de evento literais `vaga.publicada`, `vaga.preco`, `vaga.reservada`, `reserva.criada`, `vaga.assinar`, `vaga.sair`; aceitam os exemplos da porta 2 e recusam `precoCentavos` `-1` e `1.5`, `em` `'ontem'`, `vagaId` `''` e de 65 caracteres, ack `{ ok: false, erro: 'outro' }` e campo extra em `vaga.reservada` (porta 2)
Proof: `cd packages/contracts && npx tsx --test --test-name-pattern="^C21 " src/realtime.test.ts`

### S4 - cliente do Next com reconexão · 5 arquivos · ~20 KB · ~5k

**C22** - Dois consumidores assinando o cliente na mesma aba produzem uma única conexão no servidor de teste, no namespace `/realtime` do endereço de `NEXT_PUBLIC_REALTIME_URL` (S4, AC 22)
Proof: `cd apps/web && npx tsx --conditions=react-server --test --test-name-pattern="^C22 " core/shared/services/realtime-client.test.ts`

**C23** - A primeira conexão e a reconexão depois de o servidor de teste cair e voltar chegam ao servidor com `auth.token` `'token-1'` e `'token-2'`, nessa ordem, e a função de geração de token foi chamada 2 vezes (S4, AC 23)
Proof: `cd apps/web && npx tsx --conditions=react-server --test --test-name-pattern="^C23 " core/shared/services/realtime-client.test.ts`

**C24** - Com `v1` e `v2` assinadas e `v3` assinada e depois liberada, a reconexão faz o servidor receber `vaga.assinar` de `v1` e `v2` e não de `v3`, e o callback de reconexão de cada um dos 2 consumidores é chamado 1 vez (S4, AC 24)
Proof: `cd apps/web && npx tsx --conditions=react-server --test --test-name-pattern="^C24 " core/shared/services/realtime-client.test.ts`

**C25** - O servidor de teste emite `vaga.preco` com `precoCentavos: -5` e depois com `precoCentavos: 300`; o consumidor de `vaga.preco` é chamado 1 vez, com `300` (S4, AC 25)
Proof: `cd apps/web && npx tsx --conditions=react-server --test --test-name-pattern="^C25 " core/shared/services/realtime-client.test.ts`

**C26** - O estado exposto é `conectado` com o servidor de pé, passa a `reconectando` quando o servidor de teste cai e volta a `conectado` quando ele volta (S4, AC 26)
Proof: `cd apps/web && npx tsx --conditions=react-server --test --test-name-pattern="^C26 " core/shared/services/realtime-client.test.ts`

**C27** - Com a geração de token respondendo `401`, e noutro caso com o servidor recusando o handshake com `unauthorized`, o estado vira `nao_autenticado` e o servidor não recebe nenhuma tentativa nova de handshake em 1 s (S4, AC 27)
Proof: `cd apps/web && npx tsx --conditions=react-server --test --test-name-pattern="^C27 " core/shared/services/realtime-client.test.ts` (2 casos)

### S5 - portas, remoção do exemplo e portão · 8 arquivos · ~6 KB · ~2k

**C28** - O gateway de exemplo e o teste `ping`/`pong` saíram, o job de exemplo ficou e `AppModule` importa `RealtimeModule`; nenhum arquivo de `apps/api/src` fora de `modules/realtime/` importa `socket.io` ou `@nestjs/websockets` (portas 3 e 6 do HACK-12; porta 3)
Proof: `test ! -e apps/api/src/examples/example.gateway.ts && ! grep -q "C35" apps/api/src/examples/examples.test.ts && grep -q "RealtimeModule" apps/api/src/app.module.ts && ! grep -rlE "from '(socket\.io|@nestjs/websockets)'" apps/api/src --include=*.ts | grep -v "^apps/api/src/modules/realtime/" | grep -q .`
Proof: `cd apps/api && node --env-file-if-exists=.env --test --test-name-pattern="^C34 " .test-dist/examples/examples.test.js` (existente do HACK-12: o job segue registrado)

**C29** - `socket.io-client` está em `dependencies` de `apps/web` e em `devDependencies` de `apps/api`, com a mesma major (4) do `socket.io` instalado; `@socket.io/redis-adapter` não aparece no `package-lock.json` (portas 4 e 5)
Proof: `node -e "const w=require('./apps/web/package.json'),a=require('./apps/api/package.json'),l=require('./package-lock.json');const M=v=>v.replace(/^[^0-9]*/,'').split('.')[0];const ok=w.dependencies['socket.io-client']&&a.devDependencies['socket.io-client']&&M(w.dependencies['socket.io-client'])==='4'&&M(a.devDependencies['socket.io-client'])==='4'&&M(a.dependencies['socket.io'])==='4'&&!JSON.stringify(Object.keys(l.packages)).includes('@socket.io/redis-adapter');process.exit(ok?0:1)"`

**C30** - `apps/web/.env.example` traz `NEXT_PUBLIC_REALTIME_URL=http://127.0.0.1:<porta>` e nenhuma outra variável `NEXT_PUBLIC_`; `API_BASE_URL` continua sem prefixo público (porta 7)
Proof: `grep -qE '^NEXT_PUBLIC_REALTIME_URL=http://127\.0\.0\.1:[0-9]+$' apps/web/.env.example && [ "$(grep -c '^NEXT_PUBLIC_' apps/web/.env.example)" = 1 ] && grep -qE '^API_BASE_URL=' apps/web/.env.example`

**C31** - `npm run check` e `npm run build` saem com código 0 no worktree (lint, tipos, testes da API, do web e de contratos, formatação), com o lock pesado
Proof: `mkdir -p .test-logs && npm run check > .test-logs/hack38-check.log 2>&1 && npm run build > .test-logs/hack38-build.log 2>&1`

**C32** - Pelo repasse do Next, a geração do token com o Nest sem responder até o timeout devolve `504` e com a conexão recusada devolve `502`, nunca `200` (Surface, statuses `502`/`504`; existente - repasse genérico de `/api/auth/*` do HACK-12, sem código novo neste card)
Proof: `cd apps/web && npx tsx --conditions=react-server --test --test-name-pattern="^C32 " core/shared/services/api-proxy.test.ts` (teste do HACK-12, de mesmo número por coincidência)

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /api/auth/one-time-token/generate` statuses (4) | `200` C1 · `401` C1 · `502` C32 · `504` C32 | - |
| `WS /realtime` handshake statuses (4) | `101` C2 · `403` C9 · `connect_error unauthorized` C4 · `connect_error unavailable` C8 | - |
| causas de `401` na geração (2) | sem cookie C1 · sessão encerrada C1 | - |
| causas de `unauthorized` no handshake (7) | token adulterado C4 · token expirado C4 · token ruim com cookie bom C4 · token reutilizado C5 · sem token nem cookie C7 · cookie adulterado C7 · cookie de sessão encerrada C7 | - |
| caminhos de autenticação do handshake (2) | token C2 · cookie C6 | - |
| caminhos de `unavailable` (2) | token C8 · cookie C8 | - |
| papéis → sala própria (2) | `paciente` C2 · `clinica` C3 | - |
| origem do handshake (3) | igual a `WEB_ORIGIN` C9 · diferente C9 · ausente C9 | - |
| transportes recusados por origem (2) | `polling` C9 · `websocket` C9 | - |
| campos do cliente ignorados na sala (3) | `auth` C10 · query C10 · `role` em `auth` C10 | - |
| eventos cliente → servidor (2) | `vaga.assinar` C11 · `vaga.sair` C14 | - |
| ack de `vaga.assinar`/`vaga.sair` (3) | `{ ok: true }` C11 · `payload_invalido` C12 · `limite_assinaturas` C13 | - |
| `vagaId` inválido × evento (10) | C12, table-driven over all 10 | - |
| `vagaId` borda (2 edges) | 64 C12 · 65 C12 | - |
| limite de salas de vaga (2 edges) | 20 C13 · 21 C13 | - |
| eventos servidor → sala (4) | `vaga.publicada` C17 · `vaga.preco` C15 · `vaga.reservada` C16 · `reserva.criada` C18 | - |
| salas de destino (3) | `paciente:<id>` C17 · `clinica:<id>` C18 · `vaga:<id>` C15 | - |
| payload inválido no emissor (7) | C19, table-driven over all 7 | - |
| sala vazia por tipo (3) | `vaga` C20 · `paciente` C20 · `clinica` C20 | - |
| estados do cliente (3) | `conectado` C26 · `reconectando` C26 · `nao_autenticado` C27 | - |
| causas de `nao_autenticado` (2) | geração `401` C27 · handshake `unauthorized` C27 | - |
| portas de uma via (7) | 1 C2, C4, C5 · 2 C21 · 3 C28 · 4 C29 · 5 C29 · 6 C2, C3, C10 · 7 C30 | - |
| startup config: `RealtimeModule` e `WEB_ORIGIN` no gateway (1 assembly) | `AppModule.register`, usado por `createApp` no `main.ts` e por `startTestApp` C2, C9 | - |

- Claims naming a status code, route or response shape: C1, C2-C10 (handshake), C11-C14 (acks), C15-C18 (payloads), C21 - each has a proof that crosses the socket.io or HTTP boundary
- C19 prova no nível do serviço porque o serviço é a fronteira dos emissores; C21 prova o schema no próprio pacote, e C15-C18, C25 provam o mesmo schema nos dois consumidores
- No other check claims more than the single case its proof exercises

## Swept

- validação: C12, C19, C21, C25
- modos de falha: C4, C5, C7, C8, C27
- idempotência: C5 (token consumido na primeira verificação); eventos são avisos sem efeito, repetir um não muda estado
- autorização: C2, C3, C6, C10 - a sala do usuário vem só da sessão; C9 - origem; `vaga:<id>` é aberta a qualquer sessão por decisão do plano (sala sem dado pessoal, C16), conferir a existência da vaga é do HACK-13 (Out of scope do plano)
- concorrência: C5 - dois handshakes com o mesmo token: o consumo é feito em transação com trava pela biblioteca (`consumeVerificationValue`); sem teste de corrida, só o segundo uso sequencial
- ciclo de vida do dado: C4 (token expirado), C5 (token consumido); salas somem no restart (Relations do plano), sem teste
- falha de dependência: C8 (banco fora na verificação), C32 (502/504 do repasse do HACK-12, sem código novo)
- transições de estado: C26 (`conectado` → `reconectando` → `conectado`), C27 (→ `nao_autenticado`, terminal), C14 (assinada → liberada)
- observabilidade: C8 (erro registrado sem token, cookie ou dado pessoal)

## Handoff

- Pressupostos «12» conferidos em `1a2e804` (branch local do HACK-12): o build começa depois do aviso «12 em main» e do `git merge origin/main` nesta branch. Base da verificação: o `origin/main` desse merge.
- Arquivos existentes tocados (no HACK-12): `app.module.ts`, `examples.module.ts`, `examples.test.ts`, `packages/contracts/src/index.ts`, `apps/api/package.json`, `apps/web/package.json`, `apps/web/.env.example`, `scripts/smoke.mjs` ≈ 12 KB. Novos estimados: módulo, gateway e serviço do realtime e 3 testes (~45 KB), schemas e teste de contratos (~8 KB), cliente, hook e teste do web (~25 KB). Total ~90 KB / 4 ≈ 23k, mais leitura de libs (`socket.io` 4.8, `@nestjs/websockets` 11.2, `socket.io-client`) ≈ +30k → ~55k.
- S1-S5 somam ~55k, sob o orçamento de 150k - um construtor, sem handoff.
- Mecanismo: um construtor (estimativa sob o orçamento). Base do build: `origin/main` em `0779304` (merge do HACK-12, fast-forward); pressupostos «12» reconferidos contra `0779304`: só voltaram arquivos do HACK-41 que a branch do 12 não tinha.
- **Settled mid-build:** C31 - a prova gravava o log em `.test-logs/` sem criar a pasta; a prova ganhou `mkdir -p .test-logs &&` antes. A afirmação não mudou.
