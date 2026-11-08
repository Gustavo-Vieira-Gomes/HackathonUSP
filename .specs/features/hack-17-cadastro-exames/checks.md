# HACK-17 checks

Profile: standard
Plan: `.specs/features/hack-17-cadastro-exames/plan.md`

Perfil `standard` e não `light` (o padrão do contrato dos maestros): o card grava preço cheio, piso e degraus de desconto que o motor de preço do HACK-30 consome, e tem tabela de validação, corrida de TUSS repetido e corrida de edição. Um teste que passa com implementação errada aqui vira preço errado de vaga na demo. Na dúvida entre dois perfis, o mais alto.

45 checks em 6 fatias · 4 portas de uma via · 0 perguntas abertas que bloqueiam o build (a 5 do plano bloqueia só go-live)

**Como as provas rodam.**

- API: em `apps/api`, com o Postgres do worktree no ar (`127.0.0.1:54317`, banco `hack_17`; `DATABASE_URL` do `.env` lido antes de cada execução) e depois de `npm run build -w @hackathon/contracts && npx prisma generate && npx tsc -p tsconfig.json --outDir .test-dist`. `RUN` = `node --env-file-if-exists=.env --test`, com `--test-name-pattern` **antes** do arquivo. Os testes novos se chamam `H17-C<n> - ...`. Arquivos: `EX` = `.test-dist/modules/exams/exams.test.js` (cadastro, leitura, catálogo, acesso); `EXU` = `.test-dist/modules/exams/exam-update.test.js` (edição); `SET` = `.test-dist/modules/exams/clinic-settings.test.js`. Clínicas e paciente criados pelas rotas de cadastro existentes (`signUp`/`sessionCookie` de `apps/api/src/testing/test-app.ts`, geocodificador falso).
- Contratos: `CT` = `cd packages/contracts && npx tsx --test --test-name-pattern="<padrão>" src/exams.test.ts`.
- Web: `WEB` = `cd apps/web && TZ=UTC npx tsx --conditions=react-server --test --test-name-pattern="<padrão>"` sobre `core/modules/clinic-exams/**/*.test.ts`; API falsa pelo `core/shared/services/fake-api.test-helper.ts` existente.
- `SMOKE` = `npm run smoke` (exige `npm run build`, operação pesada: com o lock `.worktrees/.lock-pesado`; depois do build, a API do dev é religada).
- `PORTAL` = roteiro no portal do Maestri «HACK-17 Exames» contra `npm run dev` do worktree (web 3170, API 3171); cada passo registra o observado (URL, texto, foco, árvore de acessibilidade) em `.specs/features/hack-17-cadastro-exames/portal.md`. É a prova de comportamento de navegador que nenhum runner do repo alcança (sem Playwright; o card não adiciona dependência).

## Checks

### S1 - contrato e cadastro de exame · 9 arquivos · ~70 KB · ~18k

**C1** - A clínica logada em `POST /api/clinic/exams` com o TUSS da entrada de `allowedExams` cujo `questionnaireKey` é `mri-without-contrast`, `fullPriceCents = 72000`, `floorPriceCents = 50000`, `minLeadMinutes = 360`, `preparationCondition = 'nenhum'`, `preparationHours = 0`, `contraindications = ['pacemaker-or-defibrillator']`, `toleranceMinutes = 15`, `maxTravelMinutes = 45` e degraus `2880/10`, `1440/20`, `360/30` recebe 201 com `name` igual ao da entrada, corpo que passa em `examSchema`; o banco tem 1 `Exam` com o `clinicId` da sessão, `questionnaireKey = 'mri-without-contrast'`, `questionnaireVersion = 1` e exatamente 3 `PriceStep` (`2880/10`, `1440/20`, `360/30`) (S1, AC 1)
Proof: `RUN --test-name-pattern="^H17-C1 - " EX`

**C2** - `POST` com `floorPriceCents = 80000` e `fullPriceCents = 72000` responde 422 com corpo `{ code: 'FLOOR_ABOVE_FULL_PRICE', message: 'piso deve ser menor ou igual ao preço cheio', fields: ['floorPriceCents'] }` e o banco tem 0 `Exam` da clínica; `floorPriceCents = fullPriceCents = 72000` responde 201 (S1, AC 2; porta 2)
Proof: `RUN --test-name-pattern="^H17-C2 - " EX` (2 casos: acima e igual)

**C3** - `POST` com `tussCode` de 8 dígitos fora de `allowedExams` responde 422 com `code = 'EXAM_NOT_ALLOWED'`, `fields = ['tussCode']`, `message` contendo o `name` de cada entrada de `allowedExams` e `allowedExams` igual a `allowedExams.map(({ tussCode, name }) => ({ tussCode, name }))`, com 0 `Exam` gravado; casos: `99999999`, um código de radiografia e um de TC com contraste definidos no teste com a fonte em comentário, e o teste afirma que cada um está ausente de `allowedExams` (S1, AC 3; porta 2)
Proof: `RUN --test-name-pattern="^H17-C3 - " EX` (tabela: 3 códigos)

**C4** - `examCreateBodySchema` recusa, com o campo no caminho da issue, `toleranceMinutes` `0`, `-1`, `1.5`, `121` e `maxTravelMinutes` `0`, `-1`, `1.5`, `241`, e aceita `toleranceMinutes` `1` e `120` e `maxTravelMinutes` `1` e `240`; pela API, `toleranceMinutes = 0` responde 422 `VALIDATION_FAILED` com `fields` contendo `toleranceMinutes` e 0 `Exam` (S1, AC 4)
Proof: `CT --test-name-pattern="^H17-C4 - "` (tabela: 8 recusas, 4 aceites)
Proof: `RUN --test-name-pattern="^H17-C4 - " EX`

**C5** - O corpo válido acrescido de `clinicId`, `name`, `questionnaireKey` ou `questionnaireVersion` (um por vez) responde 422 `VALIDATION_FAILED` com o nome do campo extra em `fields` e 0 `Exam` da clínica (S1, AC 5)
Proof: `RUN --test-name-pattern="^H17-C5 - " EX` (tabela: 4 casos)

**C6** - `POST` do exame ligado a `us-thyroid` com `contraindications = ['pregnancy']` responde 422 `{ code: 'CONTRAINDICATION_NOT_IN_QUESTIONNAIRE', fields: ['contraindications.0'] }`; o de RM com `['pacemaker-or-defibrillator', 'fluid-restriction']` responde 422 com `fields = ['contraindications.1']`; nos dois, 0 `Exam`. `examCreateBodySchema` recusa `['claustrophobia', 'claustrophobia']` e `['nao-existe']` com caminho em `contraindications`; pela API, o id repetido responde 422 `VALIDATION_FAILED` (S1, AC 6; porta 2)
Proof: `RUN --test-name-pattern="^H17-C6 - " EX` (3 casos HTTP)
Proof: `CT --test-name-pattern="^H17-C6 - "` (tabela: 2 recusas)

**C7** - `examCreateBodySchema` recusa `priceSteps`: `[]` → `priceSteps`; 6 degraus válidos → `priceSteps`; `[2880/10, 2880/20]` → `priceSteps.1.leadMinutes`; `discountPercent` `0` e `101` → `priceSteps.0.discountPercent`; `leadMinutes` `0` e `10081` → `priceSteps.0.leadMinutes`; aceita 1 degrau, 5 degraus, `discountPercent` `1` e `100`, `leadMinutes` `1` e `10080`; pela API, o `leadMinutes` repetido responde 422 `VALIDATION_FAILED` com `fields` contendo `priceSteps.1.leadMinutes` e 0 `Exam` (S1, AC 7)
Proof: `CT --test-name-pattern="^H17-C7 - "` (tabela: 7 recusas, 6 aceites)
Proof: `RUN --test-name-pattern="^H17-C7 - " EX`

**C8** - `POST` com `fullPriceCents = 72000`, `floorPriceCents = 50000` e degraus `2880/10`, `360/40` responde 201 e grava o `PriceStep` `360/40` como enviado; `currentPriceCents({ fullPriceCents: 72000, floorPriceCents: 50000, steps: <degraus lidos do banco>, minutesUntilStart: 300 })` do `price-engine.ts` existente devolve `50000` (S1, AC 8; Q1)
Proof: `RUN --test-name-pattern="^H17-C8 - " EX`

**C9** - Com um exame de TUSS T já gravado na clínica, um segundo `POST` de T responde 422 `{ code: 'TUSS_ALREADY_REGISTERED', message: 'Este exame já está cadastrado na clínica.', fields: ['tussCode'] }`; em clínica nova, dois `POST` iguais de T disparados juntos (`Promise.all`) dão status ordenados `[201, 422]`, a 422 com `TUSS_ALREADY_REGISTERED`, e o banco termina com 1 `Exam` de T na clínica e os degraus de um só corpo (S1, AC 9; porta 2)
Proof: `RUN --test-name-pattern="^H17-C9 - " EX` (2 casos: sequencial e simultâneo)

**C10** - Com a Clínica A tendo o exame de TUSS T, a Clínica B em `POST` de T responde 201 e cada clínica fica com 1 `Exam` de T (S1, AC 10)
Proof: `RUN --test-name-pattern="^H17-C10 - " EX`

**C11** - `examCreateBodySchema` recusa, com o campo no caminho: `fullPriceCents` `0`, `10000001`, `720.5`; `floorPriceCents` `0`, `10000001`; `minLeadMinutes` `-1`, `10081`, `1.5`; `preparationHours` `-1`, `73`; `preparationCondition` só com espaços e com 501 caracteres; `tussCode` `'1234567'` e `'1234567a'`; aceita `fullPriceCents` `1` e `10000000`, `minLeadMinutes` `0` e `10080`, `preparationHours` `0` e `72`, `preparationCondition` com 500 caracteres; pela API, `fullPriceCents = 720.5` responde 422 `VALIDATION_FAILED` com `fields` contendo `fullPriceCents` e 0 `Exam` (S1, AC 11)
Proof: `CT --test-name-pattern="^H17-C11 - "` (tabela: 14 recusas, 7 aceites)
Proof: `RUN --test-name-pattern="^H17-C11 - " EX`

**C12** - `allowedExams` na forma da porta 1: cada `tussCode` casa `/^\d{8}$/` e é único; cada um dos 9 valores de `examQuestionnaireKeySchema` aparece em 1 ou 2 entradas e nenhuma entrada tem outra chave; `examFormDefaults` é igual ao literal da porta 1 (`toleranceMinutes: 15`, `maxTravelMinutes: 45`, degraus `2880/10`, `1440/20`, `360/30`, `depositPercent: 20`, `dailyDiscountCap: 5`) e os degraus passam em `examCreateBodySchema`; no Nest, cada chave de `allowedExams` tem questionário em `examQuestionnairesSeed`, com `preparation.condition` de 1 a 500 caracteres e `hoursBefore` ≤ 72 (o padrão do catálogo passa no corpo); `exams.ts` tem uma linha `Fonte:` por entrada (porta 1; Q4)
Proof: `CT --test-name-pattern="^H17-C12 - "`
Proof: `RUN --test-name-pattern="^H17-C12 - " EX`
Proof: `test "$(grep -c 'Fonte:' packages/contracts/src/exams.ts)" -ge "$(grep -cE "tussCode: '[0-9]{8}'" packages/contracts/src/exams.ts)"`

**C13** - O módulo existe na forma da porta 3: `ExamsModule` importa `ClinicsModule`, declara `ExamsController` e `ExamsService` e está em `imports` do `AppModule`; `ExamsController` tem `@Controller('clinic')` e `@ClinicOnly()` na classe; a aplicação de `createApp` resolve `app.get(ExamsService)` sem erro (porta 3)
Proof: `RUN --test-name-pattern="^H17-C13 - " EX`
Proof: `grep -q "imports: \[ClinicsModule\]" apps/api/src/modules/exams/exams.module.ts && grep -q "ExamsModule" apps/api/src/app.module.ts && grep -B3 "export class ExamsController" apps/api/src/modules/exams/exams.controller.ts | grep -q "@ClinicOnly()"`

### S2 - leitura, catálogo e acesso · 3 arquivos · ~25 KB · ~6k

**C14** - Com a Clínica A tendo 2 exames e a B 1, a A em `GET /api/clinic/exams?clinicId=<id da B>` recebe 200 com exatamente os 2 exames da A, ordenados por `name`, cada `priceSteps` ordenado por `leadMinutes` decrescente, nenhum `id` da B, e o corpo passa em `examListSchema` (S2, AC 12)
Proof: `RUN --test-name-pattern="^H17-C14 - " EX`

**C15** - Clínica sem exame em `GET /api/clinic/exams` recebe 200 com `{ exams: [] }` (S2, AC 13)
Proof: `RUN --test-name-pattern="^H17-C15 - " EX`

**C16** - `GET /api/clinic/exam-catalog` responde 200 com `items.length = allowedExams.length`, na mesma ordem de `tussCode`, e para cada item `name` e `questionnaireKey` da entrada, `preparation = { condition, hoursBefore }` e `contraindicationOptions = [{ id, question }]` iguais aos do questionário de `examQuestionnairesSeed` com a mesma chave; o item de `us-thyroid` tem `contraindicationOptions = []` (S2, AC 14)
Proof: `RUN --test-name-pattern="^H17-C16 - " EX`

**C17** - Sem cookie, as 6 rotas novas (`POST /api/clinic/exams`, `PUT /api/clinic/exams/<id da A>`, `GET /api/clinic/exams`, `GET /api/clinic/exam-catalog`, `GET /api/clinic/settings`, `PATCH /api/clinic/settings`) respondem 401; com sessão de `paciente`, as 6 respondem 403; nenhum `Exam` é criado e nenhum `Clinic` muda (S2, AC 15; S5, AC 37)
Proof: `RUN --test-name-pattern="^H17-C17 - " EX` (tabela: 6 rotas × 2 sessões)

### S3 - sinal e teto diário · 3 arquivos · ~12 KB · ~3k

**C18** - Clínica recém-cadastrada em `GET /api/clinic/settings` recebe 200 com `{ depositPercent: 20, dailyDiscountCap: 5 }`, que passa em `clinicSettingsSchema` (S3, AC 16)
Proof: `RUN --test-name-pattern="^H17-C18 - " SET`

**C19** - A Clínica A em `PATCH /api/clinic/settings` com `{ depositPercent: 25, dailyDiscountCap: 3 }` recebe 200 com esses valores; a linha `Clinic` da A tem `25`/`3` e a da B segue `20`/`5` (S3, AC 17)
Proof: `RUN --test-name-pattern="^H17-C19 - " SET`

**C20** - `clinicSettingsSchema` recusa, com o campo no caminho: `depositPercent` `0`, `101`, `20.5`; `dailyDiscountCap` `-1`, `101`, `2.5`; campo extra `clinicId` → `clinicId`; aceita `depositPercent` `1` e `100`, `dailyDiscountCap` `0` e `100`; pela API, `depositPercent = 0` e o corpo com `clinicId` respondem 422 `VALIDATION_FAILED` com o campo em `fields`, e a linha `Clinic` não muda (S3, AC 18)
Proof: `CT --test-name-pattern="^H17-C20 - "` (tabela: 7 recusas, 4 aceites)
Proof: `RUN --test-name-pattern="^H17-C20 - " SET` (2 casos HTTP)

### S4 - edição do exame pela API · 3 arquivos · ~30 KB · ~8k

**C21** - A Clínica A em `PUT /api/clinic/exams/<id do exame de RM dela>` com `fullPriceCents = 80000`, `floorPriceCents = 55000`, `toleranceMinutes = 20`, `maxTravelMinutes = 60`, degraus `2880/15` e `360/35` e os demais campos válidos recebe 200 com esses valores, o mesmo `id`, `tussCode`, `name` e `questionnaireKey` de antes, corpo que passa em `examSchema`; o banco tem exatamente 2 `PriceStep` do exame (`2880/15`, `360/35`) e `questionnaireVersion` igual ao anterior; repetir o mesmo `PUT` responde 200 e mantém os mesmos 2 `PriceStep` (S5, AC 29; porta 4)
Proof: `RUN --test-name-pattern="^H17-C21 - " EXU`

**C22** - `PUT` com `floorPriceCents = 90000` e `fullPriceCents = 80000` responde 422 com o corpo do C2; a linha `Exam` e os `PriceStep` ficam iguais aos de antes da chamada (S5, AC 30)
Proof: `RUN --test-name-pattern="^H17-C22 - " EXU`

**C23** - `examUpdateBodySchema` recusa as mesmas faixas do C4 e do C11 (exceto `tussCode`) com o campo no caminho; pela API, `PUT` com `maxTravelMinutes = 0` responde 422 `VALIDATION_FAILED` com `fields` contendo `maxTravelMinutes` e o exame fica como estava (S5, AC 31)
Proof: `CT --test-name-pattern="^H17-C23 - "` (tabela: as recusas de C4 e C11 sem `tussCode`)
Proof: `RUN --test-name-pattern="^H17-C23 - " EXU`

**C24** - `PUT` com o corpo válido acrescido de `tussCode`, `clinicId`, `name`, `questionnaireKey` ou `questionnaireVersion` (um por vez) responde 422 `VALIDATION_FAILED` com o campo em `fields`; a linha `Exam` fica igual (S5, AC 32; porta 4)
Proof: `RUN --test-name-pattern="^H17-C24 - " EXU` (tabela: 5 casos)

**C25** - `PUT` no exame ligado a `us-thyroid` com `contraindications = ['pregnancy']` responde 422 `CONTRAINDICATION_NOT_IN_QUESTIONNAIRE` com `fields = ['contraindications.0']`, e o exame fica como estava (S5, AC 33)
Proof: `RUN --test-name-pattern="^H17-C25 - " EXU`

**C26** - `PUT` com `priceSteps` `[]`, com 6 degraus, com `leadMinutes` repetido e com `discountPercent = 101` responde 422 `VALIDATION_FAILED`, e os `PriceStep` do exame continuam os 3 de antes (S5, AC 34)
Proof: `RUN --test-name-pattern="^H17-C26 - " EXU` (tabela: 4 casos)

**C27** - A Clínica A em `PUT /api/clinic/exams/<id do exame da B>` recebe 404 com corpo exatamente `{ code: 'NOT_FOUND', message: 'Exame não encontrado.' }`, e a linha `Exam` e os `PriceStep` da B ficam iguais (S5, AC 35; porta 4)
Proof: `RUN --test-name-pattern="^H17-C27 - " EXU`

**C28** - `PUT /api/clinic/exams/<uuid aleatório>` e `PUT /api/clinic/exams/abc` com corpo válido e sessão da A respondem 404 com o corpo exato do C27 (S5, AC 36)
Proof: `RUN --test-name-pattern="^H17-C28 - " EXU` (tabela: 2 casos)

**C29** - Em 10 rodadas, dois `PUT` válidos disparados juntos no mesmo exame, um com degraus `2880/15`, `360/35` e outro com `1440/25`, respondem ambos 200 e, ao fim de cada rodada, o conjunto de `PriceStep` do exame é exatamente o de um dos dois corpos (S5, AC 38)
Proof: `RUN --test-name-pattern="^H17-C29 - " EXU`

**C30** - `PUT` com `fullPriceCents = 72000`, `floorPriceCents = 50000` e degrau `360/40` responde 200 e grava o degrau `360/40` como enviado (S5, AC 39; Q1)
Proof: `RUN --test-name-pattern="^H17-C30 - " EXU`

### S5 - tela `/clinica/exames`: lógica no servidor e no formulário · 10 arquivos · ~55 KB · ~14k

**C31** - `reaisToCents` converte `'720,00'` → `72000`, `'720'` → `72000`, `'1.234,56'` → `123456`, `'720,5'` → `72050` e devolve `null` para `''`, `'abc'` e `'-1'`; `centsToReais(72000)` → `'720,00'`; `hoursToMinutes(48)` → `2880`, `hoursToMinutes(6)` → `360`; `minutesToHours(1440)` → `24` (S4, AC 23; S6, AC 40)
Proof: `WEB --test-name-pattern="^H17-C31 - " core/modules/clinic-exams/exam-form-values.test.ts` (tabela: 10 conversões)

**C32** - `toExamBody(valores, 'create')` com preço `'720,00'`, piso `'500,00'` e degraus `48 h · 10%`, `24 h · 20%`, `6 h · 30%` devolve `fullPriceCents = 72000`, `floorPriceCents = 50000`, `priceSteps = [2880/10, 1440/20, 360/30]` e passa em `examCreateBodySchema`; `toExamBody(valores, 'update')` devolve o mesmo corpo sem `tussCode` e passa em `examUpdateBodySchema`; `examToFormValues(exame)` de um exame com `80000`/`55000` e degrau `2880/15` devolve `'800,00'`, `'550,00'` e `48 h · 15%` (S4, AC 23; S6, AC 40)
Proof: `WEB --test-name-pattern="^H17-C32 - " core/modules/clinic-exams/exam-form-values.test.ts`

**C33** - `initialExamForm()` devolve X `15`, Y `45` e degraus `48 h · 10%`, `24 h · 20%`, `6 h · 30%` lidos de `examFormDefaults`, sem exame escolhido; `applyCatalogItem(form, item de RM)` preenche condição e horas do preparo com as do item e lista as 5 opções de contraindicação do item (as do questionário `mri-without-contrast` do seed), nenhuma marcada; `applyCatalogItem(form, item de us-thyroid)` lista 0 opções (S4, AC 21, AC 22)
Proof: `WEB --test-name-pattern="^H17-C33 - " core/modules/clinic-exams/exam-form-values.test.ts`

**C34** - `examFormErrorView(status, corpo)` devolve: 422 `FLOOR_ABOVE_FULL_PRICE` → mensagem «piso deve ser menor ou igual ao preço cheio» no campo `floorPriceCents` e `firstField = 'floorPriceCents'`; 422 `EXAM_NOT_ALLOWED` → mensagem no campo `tussCode` e a lista de nomes de `allowedExams` do corpo; 422 `VALIDATION_FAILED` com `fields = ['priceSteps.1.leadMinutes', 'toleranceMinutes']` → uma mensagem para cada, `firstField = 'priceSteps.1.leadMinutes'`; 422 `TUSS_ALREADY_REGISTERED` → mensagem no campo `tussCode`; 404 → mensagem geral «Este exame não foi encontrado» com `reload = true`; 500, 502 e 504 → mensagem geral contendo «Tente de novo em instantes» e nenhuma mensagem de campo (S4, AC 25, AC 26, AC 27; S6, AC 42)
Proof: `WEB --test-name-pattern="^H17-C34 - " core/modules/clinic-exams/exam-errors.test.ts` (tabela: 4 casos 422 + 404 + 3 status)

**C35** - `loadExamsPage(cookie, deps)` decide os ramos: sem sessão → `redirect` para `/clinica/login`; sessão `paciente` → `not-clinic` com 0 chamadas às leituras da API; sessão `clinica` com as 3 leituras ok → `page` com exames, catálogo e configuração; sessão `clinica` com qualquer uma das 3 leituras falhando (uma por vez) → `error` (S4, AC 19, AC 26)
Proof: `WEB --test-name-pattern="^H17-C35 - " core/modules/clinic-exams/exams-page.test.ts` (tabela: 3 ramos + 3 falhas)

**C36** - Cada leitura do servidor (`getClinicExams`, `getExamCatalog`, `getClinicSettings`) manda o cookie recebido e devolve `{ ok: false }` quando a API falsa responde 500, quando atrasa além do timeout (5000 ms por padrão, reduzido por opção no teste), quando o corpo não passa no schema do contrato e quando a conexão falha; devolve `{ ok: true, ... }` com o corpo válido (S4, AC 26)
Proof: `WEB --test-name-pattern="^H17-C36 - " core/modules/clinic-exams/clinic-exams.service.test.ts` (tabela: 3 leituras × (4 falhas + 1 sucesso))

**C37** - Pelo Next de produção: `GET /clinica/exames` sem cookie responde redirecionamento com `location` terminando em `/clinica/login`; com cookie de `paciente`, o HTML contém «Esta conta não é de clínica»; com cookie de clínica nova, 200 e o HTML contém «Nenhum exame cadastrado ainda.»; `POST /api/clinic/exams` pelo Next com o corpo do C1 responde 201 e, depois, o HTML de `/clinica/exames` contém o `name` do exame (S4, AC 19, AC 20, AC 24)
Proof: `npm run smoke > /tmp/hack17-smoke.log 2>&1` com exit 0, e `grep -c 'H17-C37' scripts/smoke.mjs` ≥ 4 (uma asserção por afirmação)

### S6 - tela no navegador · 0 arquivos novos (prova) · ~3k

**C38** - No portal, `/clinica/exames` de clínica nova mostra «Nenhum exame cadastrado ainda.», o formulário com X `15`, Y `45` e os degraus «48 h · 10%», «24 h · 20%», «6 h · 30%»; o campo de exame é um `<select>` com exatamente as opções do catálogo; escolher a RM preenche o preparo e mostra uma caixa de seleção por contraindicação do questionário (S4, AC 20, AC 21, AC 22)
Proof: `PORTAL` passo P1, registrado em `portal.md`

**C39** - No portal, o cadastro da RM com preço `720,00` e piso `500,00` mostra «Salvando…» com o botão `disabled` antes da resposta e, com o 201, o exame aparece na lista e o formulário volta aos padrões do C38 (S4, AC 24)
Proof: `PORTAL` passo P2, registrado em `portal.md`

**C40** - No portal, preço `720,00` e piso `800,00` mostram «piso deve ser menor ou igual ao preço cheio» junto do campo de piso, mantêm os valores digitados e deixam o foco (`document.activeElement`) no campo de piso; cadastrar de novo a RM já gravada mostra a mensagem junto do campo de exame (S4, AC 25)
Proof: `PORTAL` passo P3, registrado em `portal.md`

**C41** - No portal, com a tela carregada e a API do worktree parada, enviar o cadastro mostra «Tente de novo em instantes» e mantém os valores; recarregar a página com a API parada mostra «Não foi possível carregar os exames» e não mostra «Nenhum exame cadastrado ainda.» (S4, AC 26)
Proof: `PORTAL` passo P4, registrado em `portal.md`

**C42** - No portal, o formulário de sinal e teto mostra `20` e `5`; salvar `25` mostra «Salvando…» com o botão `disabled` e depois o valor `25` após recarregar; sinal `0` mostra a mensagem junto do campo de sinal (S4, AC 27)
Proof: `PORTAL` passo P5, registrado em `portal.md`

**C43** - No portal, «Editar» na RM abre o formulário com `720,00`, `500,00` e os degraus em horas, o nome do exame visível e sem campo editável de exame, e o botão «Salvar alterações»; salvar preço `800,00` e piso `550,00` mostra «Salvando…», a lista passa a mostrar R$ 800,00 e o formulário volta ao modo de cadastro com os padrões (S6, AC 40, AC 41)
Proof: `PORTAL` passo P6, registrado em `portal.md`

**C44** - No portal, na edição, piso acima do preço mostra a mensagem do C40 junto do campo de piso com os valores mantidos; «Cancelar edição» volta ao modo de cadastro e a lista não muda (S6, AC 42, AC 43)
Proof: `PORTAL` passo P7, registrado em `portal.md`

**C45** - No portal, a árvore de acessibilidade de `/clinica/exames` não tem campo de entrada sem nome acessível vindo de `<label>`, e o cadastro de um exame, a edição dele e o envio do sinal completam só com Tab, Espaço, setas e Enter (S4, AC 28)
Proof: `PORTAL` passo P8, registrado em `portal.md`

## Coverage

| Set (size)                                                | Member -> proof                                                                                                                                                                                              | Unproven |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `POST /api/clinic/exams` statuses (4)                     | 201 C1 · 401 C17 · 403 C17 · 422 C2                                                                                                                                                                          | -        |
| `PUT /api/clinic/exams/:id` statuses (5)                  | 200 C21 · 401 C17 · 403 C17 · 404 C27 · 422 C22                                                                                                                                                              | -        |
| `GET /api/clinic/exams` statuses (3)                      | 200 C14 · 401 C17 · 403 C17                                                                                                                                                                                  | -        |
| `GET /api/clinic/exam-catalog` statuses (3)               | 200 C16 · 401 C17 · 403 C17                                                                                                                                                                                  | -        |
| `GET /api/clinic/settings` statuses (3)                   | 200 C18 · 401 C17 · 403 C17                                                                                                                                                                                  | -        |
| `PATCH /api/clinic/settings` statuses (4)                 | 200 C19 · 401 C17 · 403 C17 · 422 C20                                                                                                                                                                        | -        |
| códigos 422 de regra do exame (4)                         | `EXAM_NOT_ALLOWED` C3 · `FLOOR_ABOVE_FULL_PRICE` C2 · `CONTRAINDICATION_NOT_IN_QUESTIONNAIRE` C6 · `TUSS_ALREADY_REGISTERED` C9                                                                              | -        |
| regras de dado aplicadas no `PUT` (2)                     | piso C22 · contraindicação C25                                                                                                                                                                               | -        |
| campos fora do contrato no `POST` (4)                     | `clinicId` C5 · `name` C5 · `questionnaireKey` C5 · `questionnaireVersion` C5                                                                                                                                | -        |
| campos fora do contrato no `PUT` (5)                      | `tussCode` C24 · `clinicId` C24 · `name` C24 · `questionnaireKey` C24 · `questionnaireVersion` C24                                                                                                           | -        |
| campos numéricos com faixa do corpo (8)                   | `fullPriceCents` C11 · `floorPriceCents` C11 · `minLeadMinutes` C11 · `preparationHours` C11 · `toleranceMinutes` C4 · `maxTravelMinutes` C4 · `priceSteps.leadMinutes` C7 · `priceSteps.discountPercent` C7 | -        |
| recusas de `priceSteps` (4)                               | vazio C7 · mais de 5 C7 · `leadMinutes` repetido C7 · `discountPercent` fora C7                                                                                                                              | -        |
| recusas de `contraindications` (3)                        | fora do questionário C6 · repetida C6 · fora do catálogo C6                                                                                                                                                  | -        |
| campos de `clinicSettingsSchema` (3)                      | `depositPercent` C20 · `dailyDiscountCap` C20 · campo extra C20                                                                                                                                              | -        |
| chaves de questionário em `allowedExams` (9)              | C12, table-driven over all 9                                                                                                                                                                                 | -        |
| portas de uma via (4)                                     | lista fechada e contrato C12 · códigos de erro C2 · módulo C13 · edição com TUSS imutável C24                                                                                                                | -        |
| ramos de `loadExamsPage` (4)                              | sem sessão C35 · `paciente` C35 · ok C35 · erro C35                                                                                                                                                          | -        |
| leituras do servidor com falha (3)                        | `getClinicExams` C36 · `getExamCatalog` C36 · `getClinicSettings` C36                                                                                                                                        | -        |
| saídas de `examFormErrorView` (6)                         | `FLOOR_ABOVE_FULL_PRICE` C34 · `EXAM_NOT_ALLOWED` C34 · `VALIDATION_FAILED` C34 · `TUSS_ALREADY_REGISTERED` C34 · 404 C34 · 5xx/502/504 C34                                                                  | -        |
| rotas do Next que repassam ao Nest (3)                    | `POST /api/clinic/exams` C37 · `PUT /api/clinic/exams/[id]` C43 · `PATCH /api/clinic/settings` C42                                                                                                           | -        |
| estados da tela (7)                                       | vazio C38 · carregando C39 · erro de campo C40 · indisponível C41 · não autorizado C37 · edição C43 · cancelar edição C44                                                                                    | -        |
| startup config: `ExamsModule` no `AppModule` (1 assembly) | `createApp`, usado por `main.ts` e por `startTestApp`, C13                                                                                                                                                   | -        |

- Relations: o plano declara `Nenhum` (forma do dado não muda); a unicidade `(clinicId, tussCode)` é exercida por C9 e C10, a `(examId, leadMinutes)` por C7 no contrato, e a trava de linha da edição por C29.
- `startTestApp` monta a aplicação pelo mesmo `createApp` do `main.ts`, então uma prova no harness (C13) cobre a única montagem.
- Claims naming a status code, route or response shape: C1 a C11, C13 a C30, C37 - cada um com prova que atravessa a fronteira HTTP.
- C4, C6, C7, C11, C20 e C23 têm prova na própria camada (tabela no contrato) e uma na fronteira; nenhum outro check afirma mais que o caso que sua prova exercita.

## Test policy

O repositório diz onde ficam os testes e como rodá-los, mas não diz em que nível cada tipo de código é provado nem quanto da tabela de decisão conta. As linhas abaixo repetem a régua do HACK-16, sem escrever nada nas diretrizes do repo.

| Code                                                                                                  | Required proofs                                               | Coverage expectation                                           |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Decide, alcançado por fronteira HTTP (schemas do corpo, `ExamsService`)                               | uma na fronteira **e** uma na própria camada quando há tabela | o contrato na fronteira; um caso por linha da tabela na camada |
| Decide, sem fronteira (conversões do formulário, mapa de erro, ramos da página, leituras do servidor) | uma na própria camada                                         | um caso por linha da tabela                                    |
| Entrada que não decide (`ExamsController`, rotas do Next, página que só renderiza)                    | uma na fronteira                                              | entrada aceita, cada recusa, cada erro                         |
| Repasse (`proxyToApi`, `ExamsModule`)                                                                 | nenhuma própria                                               | coberto pela prova do consumidor                               |

Evidence:

- `examCreateBodySchema`: 10 campos, 9 faixas numéricas, 2 regras de não repetição, `strictObject` -> decide
- `ExamsService`: 4 regras de dado (lista, piso, contraindicação, TUSS repetido) + 404 por clínica + transação da edição -> decide
- `examFormErrorView`: 6 saídas por status/código -> decide; `loadExamsPage`: 4 ramos -> decide
- análogo no repositório: `packages/contracts/src/clinic.test.ts` (tabela na camada) + `apps/api/src/modules/clinics/clinic-sign-up.test.ts` (fronteira com banco real), HACK-16

Cost: 13 provas na própria camada (CT ×7, WEB ×6) em 5 arquivos de teste.

## Swept

- validação: C4, C5, C6, C7, C11, C20, C23, C24
- modos de falha: C2, C3, C6, C9, C22, C25, C27, C28
- idempotência: C9 (`POST` repetido não duplica: `TUSS_ALREADY_REGISTERED`), C21 (`PUT` repetido mantém os mesmos degraus)
- autorização: C14, C17, C19, C27, C28 (guard global do Better Auth e `@ClinicOnly()` existentes do HACK-16; `clinicId` só de `@CurrentClinicId()`)
- concorrência: C9, C29
- ciclo de vida do dado: C21, C26 (troca total dos degraus na edição, sem resto do conjunto anterior); excluir exame fora do card (plano, Q3)
- falha de dependência: C36, C41 (API indisponível, timeout e corpo fora do contrato na tela)
- transições de estado: não se aplica - o card não muda estado de vaga; edição de preço de vaga já publicada fica com o `PricingService` existente (RN-27, plano Impact)
- observabilidade: não se aplica - o card não cria log; erro inesperado cai no tratamento global existente do Nest, sem corpo da requisição

## Handoff

- S1 = 18k (contratos `exams.ts` + teste, `index.ts`, módulo/controller/serviço de exames, `app.module.ts`, `exams.test.ts`); S2 no mesmo módulo a 24k; S3 a 27k; S4 (`exam-update.test.ts`) a 35k; S5 entra no Next a 49k; S6 é roteiro de portal, a 52k. Arquivos existentes tocados: `app.module.ts`, `contracts/src/index.ts`, `scripts/smoke.mjs` = 14 KB; lidos como referência (seed, guard test, tela de cadastro do HACK-16) = 22 KB; código e teste novos estimados em ~170 KB. (14 + 22 + 170) KB ÷ 4 ≈ 52k, abaixo do orçamento de 150k - um construtor.
- Mechanism: one builder (abaixo do orçamento, sem pergunta).
