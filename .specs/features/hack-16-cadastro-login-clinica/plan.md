# HACK-16 · 1.1 Cadastro e login da clínica

Base: `origin/main` em `55fdd75` (HACK-12, 13, 29, 30/31/34, 38, 45, 46/47 já em `main`). Nada empilhado. Sem mudança no `schema.prisma`.

## Problem

Hoje uma clínica não tem como entrar na plataforma com os dados que a RN-01 exige. O `POST /api/sign-up/clinica` do HACK-12 cria só a conta (`User` com `role = clinica`, nome, e-mail, senha) e nada cria a linha de `Clinic` do HACK-13 (endereço, latitude/longitude, CNES, responsável técnico, expediente): a conta nasce sem perfil, o matching (HACK-31, haversine sobre `Clinic.latitude/longitude`) não tem coordenada real e a reserva comum (RN-07) não tem expediente. Não há tela de cadastro nem de login de clínica no Next.

O segundo custo é de segurança: não existe regra única que diga "esta requisição é da clínica X". HACK-17 (exames), 18 (agenda), 19 (sincronização) e 20 (vagas) vão abrir rotas de clínica; sem um guard comum, cada um decidiria sozinho de onde tirar o id da clínica, e basta um confiar no id da URL para a Clínica A ler a vaga da Clínica B (RN-04, F2 «Isolamento entre clínicas»). O card está na Onda 2 e bloqueia HACK-17 e HACK-18. O card não traz número de esforço; o prazo é o do hackathon.

Quando isto entrar: a clínica abre `/clinica/cadastro`, preenche nome, endereço, CNES, responsável técnico e expediente por dia da semana, e sai logada no painel `/clinica` com o perfil gravado e o endereço geocodificado; volta depois por `/clinica/login`. Do lado do Nest, toda rota de clínica declara `@ClinicOnly()` e recebe o id da clínica por `@CurrentClinicId()`, tirado da sessão; recurso de outra clínica responde 404.

## Flow

Reaproveita o Better Auth montado no Nest com o guard global da `@thallesp/nestjs-better-auth` (`request.session`, `@Roles`), o `POST /api/sign-up/clinica` com o `SignUpRequestGuard` e o limite de taxa (HACK-12), os modelos `Clinic` e `ClinicOpeningHours` (HACK-13, sem mudança), o `proxyToApi` e o `getSessionUser` do Next; nenhuma sessão própria, nenhum segundo endpoint de cadastro de clínica.

1. navegador em `/clinica/cadastro` (novo, Next, placement) envia o formulário em JSON para `POST /api/sign-up/clinica` do Next, que já repassa ao Nest pelo `proxyToApi` (existente) com cookie e origem.
2. `SignUpController.signUpClinica` (existente, HACK-12) valida o corpo com o schema novo `clinicSignUpBodySchema` (porta 2) pelo `ZodBodyPipe` (novo, porta 3); falha → 422 com `fields`, antes de qualquer escrita ou chamada externa. A rota de paciente segue como está.
3. `ClinicSignUpService` (novo, em `modules/clinics`, porta 1) confere se o CNES já existe (422 `CNES_TAKEN`) e chama o `GeocodingService` (novo, porta 5) com o endereço; sem resultado → 422 no campo `address`; fornecedor fora ou lento → 503 `GEOCODING_UNAVAILABLE`; nos dois casos nenhuma conta nasce.
4. `SignUpService.signUp('clinica', …)` (existente, HACK-12) cria o `User` pelo Better Auth e devolve o `set-cookie`; e-mail repetido continua 422 do Better Auth.
5. `ClinicSignUpService` grava `Clinic` com `openingHours` aninhado num único `create` do `PrismaService` (existente); se essa escrita falha (CNES gravado por outra requisição no meio, P2002), apaga o `User` recém-criado (cascade leva `Session` e `Account`) e responde 422 `CNES_TAKEN` sem cookie.
6. out: 200 com `{ user, clinic }` e o cookie de sessão; o Next repassa o `set-cookie` e a tela vai para `/clinica`.
7. login: `/clinica/login` (novo, Next) envia e-mail e senha a `POST /api/auth/sign-in/email` pelo proxy existente `app/api/auth/[...path]`; sucesso → `/clinica`.
8. `/clinica` (novo, Server Component) lê a sessão com `getSessionUser` (existente); sem sessão → redireciona a `/clinica/login`; papel `paciente` → aviso «esta conta não é de clínica» com botão de sair; papel `clinica` → chama `GET /api/clinic/me` com o cookie e mostra o perfil e o expediente.
9. toda rota de clínica no Nest (aqui: `GET /api/clinic/me` e `GET /api/clinic/vacancies/:id`; depois HACK-17 a 20) passa pelo guard global (401 sem sessão), por `@Roles(['clinica'])` (403 para paciente) e pelo `ClinicGuard` (novo, porta 4), que busca `Clinic.id` por `userId` da sessão e o põe na requisição; o handler lê com `@CurrentClinicId()` e filtra toda consulta por ele; recurso de outra clínica → 404.

## Impact

| Front             | What changes                                                                                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contratos         | `POST /api/sign-up/clinica` muda de corpo: deixa de aceitar só `{ name, email, password }` e passa a exigir o perfil completo (porta 2); erro de validação passa de 400 `INVALID_BODY` para 422 `VALIDATION_FAILED`. Consumidor hoje: só testes do HACK-12 e o proxy do Next |
| testes existentes | `signUpWithCookie(t, 'clinica')` em `apps/api/src/testing/test-app.ts:84` e os casos `clinica` de `sign-up.test.ts`, `sign-up-protection.test.ts`, `session.test.ts` e `one-time-token.test.ts` passam a mandar o corpo de clínica válido e a usar o geocodificador falso    |
| domain            | termo novo: **clínica da sessão** - o `Clinic.id` cujo `userId` é o da sessão; única fonte do id da clínica em rota de clínica, em `apps/api/src/modules/clinics/`                                                                                                           |
| domain            | termo existente: `Clinic` (HACK-13) passa a ter um escritor: o cadastro deste card. `ClinicOpeningHours` ganha a primeira escrita real                                                                                                                                       |
| outros cards      | HACK-17, 18, 19, 20 importam `ClinicsModule` e usam `@ClinicOnly()` + `@CurrentClinicId()` (porta 4); id de clínica em URL ou corpo fica proibido (regra de revisão)                                                                                                         |
| outros cards      | HACK-17 reaproveita o `ZodBodyPipe` e o formato 422 da porta 3 para "422 com o campo"                                                                                                                                                                                        |
| configuração      | variáveis novas opcionais `GEOCODER_URL`, `GEOCODER_USER_AGENT` e `GEOCODER_MIN_INTERVAL_MS` na API (porta 5), com padrão; `.env.example` da API ganha as três linhas                                                                                                        |
| schema.prisma     | não muda: `Clinic` já tem `name`, `address`, `latitude`, `longitude`, `cnes @unique`, `technicalManager` e `ClinicOpeningHours` já tem `weekday`, `startMinute`, `endMinute` com CHECK de faixa                                                                              |
| stored data       | nada a migrar: nenhum `Clinic` é gravado por código hoje (só fixtures de teste); contas `clinica` já criadas pelo HACK-12 sem perfil recebem 403 `CLINIC_PROFILE_MISSING` no guard                                                                                           |

## Relations

Nenhum - nenhuma mudança na forma do dado. O card escreve `User` 1:1 `Clinic` 1:N `ClinicOpeningHours` como o HACK-13 os criou; a unicidade do CNES (`Clinic.cnes @unique`) e o 1:1 (`Clinic.userId @unique`) já existem e são o mecanismo das AC 9 e 10.

## Surface

| Route                           | In                                                                                                                           | Out                                                                                                  | Status                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `POST /api/sign-up/clinica`     | `name`, `email`, `password`, `address`, `cnes`, `technicalManager`, `openingHours[]` (`weekday`, `startMinute`, `endMinute`) | `user` (`id`, `name`, `email`, `role`) · `clinic` (`id`, `latitude`, `longitude`) · cookie de sessão | `200`, `403`, `415`, `422`, `429`, `503` |
| `GET /api/clinic/me`            | cookie de sessão                                                                                                             | `id`, `name`, `address`, `latitude`, `longitude`, `cnes`, `technicalManager`, `openingHours[]`       | `200`, `401`, `403`                      |
| `GET /api/clinic/vacancies/:id` | cookie de sessão, `id` da vaga                                                                                               | `id`, `state`, `origin`, `currentPriceCents`, `slot` (`startsAt`, `endsAt`, `examId`)                | `200`, `401`, `403`, `404`               |

## Landing

| One-way door                               | Literal shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Alternative rejected                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Módulo dono da clínica                  | `apps/api/src/modules/clinics/clinics.module.ts`: `@Module({ imports: [AuthModule], controllers: [ClinicsController], providers: [ClinicSignUpService, ClinicGuard, GeocodingService], exports: [ClinicGuard] })`. O `SignUpController` do HACK-12 delega a rota `clinica` ao `ClinicSignUpService`, que usa o `SignUpService` exportado pelo `AuthModule`                                                                                                                                                                                                                                                                                                                                                                                                                                         | perfil criado dentro do `databaseHooks.user.create.after` do Better Auth (regra de clínica dentro da config de auth, sem acesso limpo ao corpo nem ao geocodificador); módulo `clinic` em `common/` (design-patterns: regra de negócio fica no módulo dono)                                                                                                                                     |
| 2. Corpo do cadastro de clínica (contrato) | `packages/contracts/src/clinic.ts`: `clinicSignUpBodySchema = z.strictObject({ name: trim 1..120, email: z.email().max(254), password: 8..128, address: trim 5..300, cnes: /^\d{7}$/, technicalManager: trim 3..160, openingHours: z.array(z.strictObject({ weekday: int 0..6, startMinute: int 0..1439, endMinute: int 1..1440 })).min(1).max(14) })` com refine `startMinute < endMinute` e sem sobreposição no mesmo `weekday`; `name` vira `User.name` e `Clinic.name`. `clinicProfileSchema` e `clinicVacancySchema` para as respostas                                                                                                                                                                                                                                                        | manter `{ name, email, password }` e criar o perfil num segundo endpoint `POST /api/clinic/profile` (a conta nasce sem perfil sempre que o segundo passo falha - geocodificação, CNES - e o formulário teria de retomar a meio; o guard veria `clinica` sem `Clinic` como caso normal); lat/lng digitados pela clínica (RN-01 pede geolocalização confiável, não um número que ninguém confere) |
| 3. Formato do erro de validação (422)      | `apps/api/src/common/pipes/zod-body.pipe.ts`: `new ZodBodyPipe(schema)` lança `UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: 'Campos inválidos ou ausentes.', fields: string[] })`, `fields` = caminhos únicos das issues (`openingHours.0.endMinute`, `cnes`…), corpo vazio ou não objeto → `fields: ['body']`. Erros de campo de regra seguem o mesmo corpo: `{ code: 'CNES_TAKEN' \| 'ADDRESS_NOT_FOUND', message, fields: ['cnes' \| 'address'] }`                                                                                                                                                                                                                                                                                                                        | 400 `INVALID_BODY` como o paciente (o card pede 422); `ValidationPipe` + `class-validator` (segunda fonte de verdade ao lado do Zod dos contratos, contra structure.md); filtro global que reescreve todo erro (mudaria rotas que não são deste card)                                                                                                                                           |
| 4. API do guard de clínica (HACK-17 a 20)  | `@ClinicOnly()` = `applyDecorators(Roles(['clinica']), UseGuards(ClinicGuard))` no controller; `ClinicGuard` lê `request.session.user.id`, faz `prisma.clinic.findUnique({ where: { userId }, select: { id: true } })`, sem linha → `ForbiddenException({ code: 'CLINIC_PROFILE_MISSING', message })`, com linha → `request.clinicId = clinic.id`; `@CurrentClinicId()` = `createParamDecorator` que devolve `request.clinicId: string`. Convenção: consulta por id de recurso usa `where: { id, clinicId }` (ou `slot: { clinicId }`), `null` → `NotFoundException({ code: 'NOT_FOUND', message: '<Recurso> não encontrado.' })`; `:id` que não é uuid também é 404; schema de corpo de rota de clínica nunca tem `clinicId` (strictObject recusa com 422)                                        | id da clínica no path (`/clinics/:clinicId/...`) checado contra a sessão (convida a esquecer a checagem; o card proíbe confiar no id da URL); 403 para recurso de outra clínica (revela que o id existe; F2 pede "não encontrado"); escopo por request (`REQUEST`-scoped provider) (custo em todo provider dependente, sem ganho sobre a propriedade da requisição)                             |
| 5. Geocodificação (dependência externa)    | Nominatim (OpenStreetMap), sem chave (pergunta 1, resolvida em 08/11/2026). `GeocodingService.geocode(address): Promise<{ latitude, longitude } \| null>` faz `GET ${GEOCODER_URL}/search?format=jsonv2&limit=1&countrycodes=br&q=<address>` com header `User-Agent: ${GEOCODER_USER_AGENT}`, `AbortSignal.timeout(5000)`, sem retentativa; resposta validada com Zod (`lat`/`lon` string numérica); `[]` → `null`; HTTP ≠ 200, timeout, rede ou formato inválido → `ServiceUnavailableException({ code: 'GEOCODING_UNAVAILABLE' })`. Padrões: `GEOCODER_URL=https://nominatim.openstreetmap.org`, `GEOCODER_USER_AGENT=hackathon-usp-marketplace/0.1`; no máximo 1 requisição por segundo por processo (chamadas seguintes esperam a vez, espaçadas de 1000 ms), conforme a política do Nominatim | Google Geocoding API (paga, exige chave e faturamento no projeto Google Cloud); latitude/longitude digitadas ou clicadas num mapa (sem fornecedor, mas exige componente de mapa e confia no dado da clínica); ViaCEP (devolve endereço, não coordenada)                                                                                                                                         |
| 6. Rota de leitura de vaga da clínica      | `GET /api/clinic/vacancies/:id` no `ClinicsController`, lendo `prisma.vacancy.findFirst({ where: { id, slot: { clinicId } } })`: é a rota que prova o critério do card; HACK-20 estende ou substitui mantendo o 404                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | provar o 404 só com controller de teste (o critério do card fala de acesso real pela URL e o HACK-20 ainda não existe); colocar no `VacanciesModule` (o módulo do HACK-29 é dono das transições, não da leitura por clínica; importar `ClinicsModule` lá cria dependência que o HACK-20 decide)                                                                                                 |

- Adendo à porta 5 (Maestro, 08/11/2026, na aprovação dos checks): o intervalo mínimo entre chamadas ao geocodificador é configurável por `GEOCODER_MIN_INTERVAL_MS` (inteiro ≥ 0, padrão 1000), espaçamento em memória do processo, sem fila durável; a suíte usa 0, exceto o teste do espaçamento.
- Adendo à porta 1 (build, 08/11/2026): a rota `POST /api/sign-up/clinica` sai do `SignUpController` do `AuthModule` e vai para um `ClinicSignUpController` no `ClinicsModule`, com os mesmos `@AllowAnonymous()`, `SignUpRequestGuard`, `ThrottlerGuard` e `@Throttle` do HACK-12. Motivo: o `ClinicsModule` importa o `AuthModule` (para o `SignUpService`); o `SignUpController` delegar ao `ClinicSignUpService` faria o `AuthModule` importar o `ClinicsModule` de volta (dependência circular, `forwardRef` evitado pela regra de padrões). O `AuthModule` passa a exportar o `SignUpService`. Rota, corpo e status ficam como na porta 2 e 3; o limite de taxa continua contado por rota.
- Nada mais nesta mudança é difícil de reverter: textos de tela, nomes de componente, divisão de arquivos no Next e mensagens de log se decidem no diff.

## Criteria

### S1: cadastro completo da clínica num passo (P1)

A clínica sai do formulário com conta, perfil e coordenadas gravados, ou com nada gravado.

**Acceptance Criteria**

1. QUANDO `POST /api/sign-up/clinica` recebe um corpo válido com origem `WEB_ORIGIN` e o geocodificador devolve `lat = -23.5617`, `lon = -46.6560` ENTÃO o sistema DEVE responder 200 com `user.role = 'clinica'`, `clinic.latitude = -23.5617`, `clinic.longitude = -46.6560`, um `set-cookie` de sessão HttpOnly, e gravar um `User`, um `Clinic` com `name`, `address`, `cnes`, `technicalManager` do corpo e uma linha de `ClinicOpeningHours` por faixa enviada.
2. SE o corpo não tem `cnes` (ou qualquer outro campo obrigatório) ENTÃO o sistema DEVE responder 422 com `code = 'VALIDATION_FAILED'` e `fields` contendo `cnes`, sem chamar o geocodificador e sem gravar `User` nem `Clinic`.
3. SE `cnes` não tem exatamente 7 dígitos, `address` tem menos de 5 caracteres ou `technicalManager` tem menos de 3 ENTÃO o sistema DEVE responder 422 com o nome do campo em `fields`.
4. SE `openingHours` está vazio, tem uma faixa com `startMinute >= endMinute`, `weekday` fora de 0..6, `endMinute > 1440` ou duas faixas que se sobrepõem no mesmo `weekday` ENTÃO o sistema DEVE responder 422 com o caminho do campo em `fields` (ex.: `openingHours.1.endMinute`) e não DEVE gravar nada.
5. SE o corpo traz um campo fora do contrato (`role`, `clinicId`, `latitude`, `longitude`) ENTÃO o sistema DEVE responder 422 com esse campo em `fields`.
6. SE o geocodificador devolve lista vazia para o endereço ENTÃO o sistema DEVE responder 422 com `code = 'ADDRESS_NOT_FOUND'` e `fields = ['address']`, sem gravar `User` nem `Clinic`.
7. SE o geocodificador responde com status diferente de 200, com corpo fora do formato, ou não responde em 5000 ms ENTÃO o sistema DEVE responder 503 com `code = 'GEOCODING_UNAVAILABLE'`, sem gravar `User` nem `Clinic`.
8. SE o e-mail já tem conta ENTÃO o sistema DEVE responder 422 (erro do Better Auth, como no HACK-12) e não DEVE gravar segundo `User` nem `Clinic`.
9. SE o `cnes` já pertence a outra clínica ENTÃO o sistema DEVE responder 422 com `code = 'CNES_TAKEN'` e `fields = ['cnes']`, sem gravar `User`.
10. QUANDO duas requisições de cadastro com o mesmo `cnes` e e-mails diferentes chegam ao mesmo tempo ENTÃO exatamente uma DEVE responder 200 e a outra 422 `CNES_TAKEN`, e o banco DEVE terminar com um `Clinic` e um `User` com aquele e-mail perdedor ausente.
11. O sistema DEVE manter em `POST /api/sign-up/clinica` a recusa de origem (403), de corpo não JSON (415) e o limite de taxa (429) do HACK-12.

**Independent test:** `npm run test -w @hackathon/api` com o banco do worktree no ar e um geocodificador falso em porta efêmera (`GEOCODER_URL` apontando para ele); cada caso confere status, corpo e as contagens de `User`/`Clinic` pelo e-mail e CNES do teste.

### S2: guard de clínica e isolamento entre clínicas (P1)

RN-04 e F2 «Isolamento entre clínicas» com mecanismo único, pronto para HACK-17 a 20.

**Acceptance Criteria**

12. QUANDO a Clínica A, logada, chama `GET /api/clinic/vacancies/:id` com o id de uma vaga num horário da Clínica B ENTÃO o sistema DEVE responder 404 com `code = 'NOT_FOUND'` e nenhum campo da vaga no corpo.
13. QUANDO a Clínica A chama `GET /api/clinic/vacancies/:id` com o id de uma vaga dela ENTÃO o sistema DEVE responder 200 com `id`, `state`, `origin`, `currentPriceCents` e `slot.startsAt`, `slot.endsAt`, `slot.examId` dessa vaga.
14. SE `:id` não é uuid ou não existe ENTÃO o sistema DEVE responder 404 com o mesmo corpo da AC 12.
15. SE a requisição a uma rota `@ClinicOnly()` não tem sessão ENTÃO o sistema DEVE responder 401.
16. SE a sessão é de uma conta `paciente` ENTÃO o sistema DEVE responder 403 em toda rota `@ClinicOnly()`.
17. SE a sessão é de uma conta `clinica` sem linha de `Clinic` ENTÃO o sistema DEVE responder 403 com `code = 'CLINIC_PROFILE_MISSING'`.
18. QUANDO a Clínica A chama `GET /api/clinic/me` ENTÃO o sistema DEVE devolver o perfil da Clínica A (o `cnes` dela) mesmo que a requisição traga `?clinicId=<id da B>` ou header com o id da B.

**Independent test:** mesmo runner; duas clínicas criadas pela rota de cadastro, uma vaga em cada (fixtures do HACK-13), chamadas com o cookie de cada uma e sem cookie.

### S3: telas de cadastro, login e painel da clínica (P1)

A clínica faz o fluxo inteiro pelo navegador, em layout desktop.

**Acceptance Criteria**

19. QUANDO a clínica preenche `/clinica/cadastro` com dados válidos e envia ENTÃO a tela DEVE mostrar o estado «Cadastrando…» com o botão desabilitado e, com a resposta 200, navegar para `/clinica`.
20. SE a API responde 422 com `fields` ENTÃO `/clinica/cadastro` DEVE mostrar a mensagem de erro junto de cada campo listado, manter os valores digitados e mover o foco para o primeiro campo com erro.
21. SE a API responde 503 `GEOCODING_UNAVAILABLE`, 502, 504 ou 429 ENTÃO `/clinica/cadastro` DEVE mostrar uma mensagem de indisponibilidade com o texto «Tente de novo em instantes» e manter os valores digitados.
22. O formulário de `/clinica/cadastro` DEVE ter, para cada dia de domingo a sábado, a opção «Fechado» e os campos de abertura e fechamento (`HH:MM`), e DEVE enviar `openingHours` com `weekday` 0 a 6 e minutos do dia na hora local de America/Sao_Paulo.
23. QUANDO a clínica entra em `/clinica/login` com e-mail e senha corretos ENTÃO a tela DEVE navegar para `/clinica`; SE a senha está errada ENTÃO DEVE mostrar «E-mail ou senha inválidos» sem limpar o e-mail.
24. QUANDO `/clinica` é aberto sem sessão ENTÃO o Next DEVE redirecionar para `/clinica/login`.
25. QUANDO `/clinica` é aberto com sessão `clinica` ENTÃO a tela DEVE mostrar nome, endereço, CNES, responsável técnico e o expediente por dia (dia sem faixa aparece como «Fechado»).
26. SE `/clinica` é aberto com sessão `paciente` ENTÃO a tela DEVE mostrar «Esta conta não é de clínica» e um botão «Sair», sem chamar `GET /api/clinic/me`.
27. SE `GET /api/clinic/me` falha, estoura 5000 ms ou responde fora do contrato ENTÃO `/clinica` DEVE mostrar «Não foi possível carregar o perfil da clínica» em vez de dados vazios.
28. O sistema DEVE dar a todo campo das telas de clínica um `<label>` associado e DEVE deixar o fluxo de cadastro e login operável só pelo teclado.

**Independent test:** `npm run dev` no worktree, navegador em `http://127.0.0.1:3160/clinica/cadastro` (portal do Maestri ou Playwright): cadastro feliz até o painel, um 422 (CNES com 6 dígitos), sair, login, login com senha errada, `/clinica` sem cookie.

### S4: falha e uso do geocodificador ficam visíveis no log, sem dado sensível (P2)

**Acceptance Criteria**

29. SE a chamada ao geocodificador falha (status, timeout, rede ou formato) ENTÃO o sistema DEVE registrar uma linha de log `warn` com o motivo (`status=<n>`, `timeout`, `network` ou `invalid_body`) e a duração em ms, sem o endereço, o e-mail ou a senha.
30. SE a gravação do `Clinic` falha depois de o `User` ter sido criado ENTÃO o sistema DEVE registrar uma linha de log `warn` com `code = 'CNES_TAKEN'` e o id do `User` removido, sem o e-mail.

**Independent test:** mesmo runner da S1, capturando o logger do Nest no caso de timeout e no caso da AC 10.

## Out of scope

| Excluded                                            | Why                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Edição do perfil e do expediente depois do cadastro | O card pede cadastro e login; edição entra quando um card pedir (sem rota `PATCH` agora)                     |
| Cadastro de exames                                  | HACK-17, que consome o guard e o `ZodBodyPipe` deste card                                                    |
| Telas de vaga da clínica (`/clinica/vagas/...`)     | HACK-20; aqui só a rota de API que prova o 404                                                               |
| Recuperação de senha e verificação de e-mail        | Não pedidas no card nem na F2; Better Auth suporta quando um card pedir                                      |
| Mudar o 400 do cadastro de paciente para 422        | Rota do paciente (F1, HACK-14); o card fala da clínica. O `ZodBodyPipe` fica disponível para essa mudança    |
| Seed das 8 clínicas pré-carregadas da demo          | Card de dados da demo; aqui só o fluxo real de cadastro                                                      |
| Mapa para conferir ou ajustar a coordenada          | Sem pedido; a coordenada vem do geocodificador                                                               |
| Faixas múltiplas no mesmo dia pela tela             | A API aceita até 14 faixas sem sobreposição; a tela oferece uma faixa por dia (expediente de clínica típico) |

## Assumptions

| Assumption                                                  | Chosen default                                                                                         | Rationale                                                                                        | Confirmed?     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------- |
| Responsável técnico "identificado" (RN-01)                  | Um campo de texto `technicalManager` (3 a 160 caracteres), rotulado «Responsável técnico (nome e CRM)» | O schema do HACK-13 tem uma coluna só; separar nome e CRM é mudança de schema sem pedido do card | y (08/11/2026) |
| Nome da conta × nome da clínica                             | `name` do corpo vai para `User.name` e `Clinic.name`                                                   | Uma conta por clínica (1:1); evita pedir o mesmo dado duas vezes                                 | n              |
| Formato do CNES                                             | Exatamente 7 dígitos, sem conferência na base do DATASUS                                               | É o formato do CNES; consulta externa ao CNES não foi pedida                                     | n              |
| Erro de campo de regra (CNES repetido, endereço não achado) | 422 com o mesmo corpo `{ code, message, fields }` da validação                                         | E-mail repetido já é 422 no HACK-12; a tela trata todo erro de campo do mesmo jeito              | n              |
| Conta `clinica` sem perfil (criada antes deste card)        | 403 `CLINIC_PROFILE_MISSING` no guard; sem tela de completar perfil                                    | Só existem em bancos de teste/dev; o cadastro novo não deixa mais esse estado                    | n              |
| Expediente obrigatório                                      | Pelo menos uma faixa                                                                                   | Sem expediente a RN-07 não gera oferta de reserva comum                                          | n              |
| Login de conta `paciente` em `/clinica/login`               | O login passa (é o Better Auth genérico) e `/clinica` mostra «Esta conta não é de clínica» com «Sair»  | A sessão é única por conta; bloquear no login exigiria rota própria de login por papel           | n              |
| Limite de taxa do geocodificador                            | 1 requisição por segundo por processo no `GeocodingService`, além dos 30/min por rota do HACK-12       | Resposta da pergunta 1 (08/11/2026): a política do Nominatim pede no máximo 1 req/s              | y (08/11/2026) |

**Perguntas abertas:**

| #   | Kind           | Question                                                                                                                                                                                                           | Until answered                                            |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1   | resolved       | Geocodificador: **Nominatim/OpenStreetMap** (Gustavo, 08/11/2026), timeout 5 s, sem retentativa, 1 req/s, `User-Agent` genérico do app `hackathon-usp-marketplace/0.1` (sem e-mail pessoal), URL em `GEOCODER_URL` | Resolvida: porta 5                                        |
| 2   | resolved       | Corpo de `POST /api/sign-up/clinica`: **perfil completo num passo, 422** (Gustavo, 08/11/2026)                                                                                                                     | Resolvida: porta 2 e porta 3                              |
| 3   | blocks go-live | Nominatim público não serve para produção com volume (política de uso); para além da demo, usar instância própria ou provedor pago                                                                                 | Vale para a demo; trocar `GEOCODER_URL` antes de uso real |

## Observable

| Surface                                                   | Decision                     | Landing                                                                                                 |
| --------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| screen `/clinica/cadastro`                                | empty state                  | não se aplica - formulário novo, sem lista                                                              |
| screen `/clinica/cadastro`                                | loading state                | AC 19                                                                                                   |
| screen `/clinica/cadastro`                                | error state                  | AC 20, AC 21                                                                                            |
| screen `/clinica/cadastro`                                | unauthorised state           | não se aplica - rota pública de cadastro                                                                |
| screen `/clinica/cadastro`                                | density and ordering         | AC 22 - dias de domingo a sábado, uma faixa por dia                                                     |
| screen `/clinica/login`                                   | loading, error states        | AC 23                                                                                                   |
| screen `/clinica`                                         | unauthorised state           | AC 24, AC 26                                                                                            |
| screen `/clinica`                                         | error state                  | AC 27                                                                                                   |
| screen `/clinica`                                         | empty state                  | AC 25 - dia sem faixa aparece como «Fechado»                                                            |
| all screens `/clinica*`                                   | destructive action confirms  | não se aplica - nenhuma ação destrutiva; «Sair» só encerra a sessão                                     |
| all screens `/clinica*`                                   | acessibilidade               | AC 28                                                                                                   |
| API `POST /api/sign-up/clinica`                           | error shape and codes        | AC 2 a 9, porta 3                                                                                       |
| API `POST /api/sign-up/clinica`                           | who may call it, rate limit  | existente - `SignUpRequestGuard` (origem, JSON) e 30/min do HACK-12; AC 11                              |
| API `GET /api/clinic/me`, `GET /api/clinic/vacancies/:id` | who may call it, error shape | AC 12, AC 14 a 18, porta 4                                                                              |
| all new `GET /api/clinic/*`                               | rate limits                  | não se aplica - leitura autenticada da própria clínica; nenhuma rota autenticada da API tem limite hoje |
| all new `/api/clinic/*`                                   | versioning                   | não se aplica - API consumida só pelo Next do mesmo repositório                                         |
| all new `/api/clinic/*`                                   | response shape               | porta 2 - `clinicProfileSchema` e `clinicVacancySchema` nos contratos; Next valida a resposta           |

## Sources

- Card HACK-16 no Linear: https://linear.app/workspace-do-gustavo/issue/HACK-16/11-cadastro-e-login-da-clinica - entrega, guard e os dois critérios (404 entre clínicas, 422 com o campo). Sem comentários no card.
- `docs/product/marketplace-vagas-imagem.md` - RN-01, RN-04, F2 «Isolamento entre clínicas», RN-07 (expediente).
- `.specs/features/marketplace-vagas-imagem/brainstorm.md` «Stack e decisões técnicas» - T1 (geo por haversine), T2 (Better Auth no Nest, papel em `additionalFields`), T11 (rotas `/clinica/...` desktop).
- Pedido do Maestro Clínica (08/11/2026): reaproveitar HACK-12/13, guard estável para HACK-17 a 20, geocodificação como pergunta se envolver conta externa.
