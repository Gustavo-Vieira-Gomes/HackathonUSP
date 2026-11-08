# F1 - Cadastro e login do paciente - checks

Build: `npm run build`; `npm run lint`; `npm run typecheck`; `npm run format:check`
Run api: `npm run test -w @hackathon/api`
Run contracts: `npm run test -w @hackathon/contracts`
Plan: `.specs/features/f1-patient-auth/plan.md`

44 checks in 4 slices · 6 one-way doors · 0 open

Os testes da API sobem a aplicação Nest real numa porta efêmera contra o Postgres local
(`compose.yaml`, banco `hackathon_test` recriado antes da suíte). As telas não têm captura nem
runner de teste web: são provadas por `walk` no navegador (Assumptions do plano).

## Checks

### S1 - Cadastro com consentimento

**C1** - `POST /api/patients` válido responde `201` com exatamente `{ id, name, email, phone }` e `Set-Cookie` de sessão `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` (AC 1)
Proof: run api | ✔ C1 cadastro válido responde 201 com o paciente e cookie de sessão

**C2** - E-mail `" Maria@Exemplo.com "` vira `"maria@exemplo.com"`; celular `"(11) 98765-4321"` vira `"+5511987654321"`; fixo `"1133334444"` vira `"+551133334444"`, na resposta e no banco (AC 1)
Proof: run api | ✔ C2 cadastro normaliza e-mail e telefone

**C3** - O cadastro grava `healthConsentVersion = "saude-v1"`, `healthConsentAcceptedAt` com o horário do servidor (menos de 5 s do relógio do teste) e `role = "patient"`, ignorando `healthConsentAcceptedAt` e `role` enviados no body (AC 2)
Proof: run api | ✔ C3 cadastro grava versão e horário do consentimento pelo servidor

**C4** - Consentimento ausente, `false` ou versão `"saude-v0"` responde `422 consent_required` e as contagens de `user`, `account` e `session` ficam iguais (AC 3)
Proof: run api | ✔ C4 cadastro sem consentimento responde 422 e não cria nada

**C5** - Campos inválidos com consentimento `false` respondem `400 validation_failed`, não `422`, sem criar nada (AC 3)
Proof: run api | ✔ C5 formato inválido tem precedência sobre consentimento

**C6** - Formato inválido responde `400 validation_failed` com `fields` exato: senha 7 → `["password"]`, 8 aceita, 128 aceita, 129 → `["password"]`, nome `"   "` → `["name"]`, nome de 1 caractere → `["name"]`, e-mail `"maria.exemplo.com"` → `["email"]`, telefone de 9 dígitos → `["phone"]`, nome e e-mail juntos → `["name","email"]` (AC 4)
Proof: run api | ✔ C6 cadastro com formato inválido responde 400 com os campos

**C7** - E-mail já cadastrado (`"MARIA@exemplo.com"` sobre `"maria@exemplo.com"`) responde `409 email_in_use`; nome e telefone da conta seguem iguais e a senha antiga ainda entra (AC 5)
Proof: run api | ✔ C7 e-mail já cadastrado responde 409 sem alterar a conta

**C8** - Nenhuma coluna de `user`, `account` ou `session` contém a senha enviada, e nenhuma resposta de cadastro, login ou `/me` tem chave `password` ou valor igual à senha (AC 6)
Proof: run api | ✔ C8 senha nunca é gravada nem devolvida em texto

**C9** - Dois cadastros simultâneos com o mesmo e-mail resultam em exatamente um `201` e um `409 email_in_use`, e uma única linha em `user` (AC 5)
Proof: run api | ✔ C9 cadastros simultâneos do mesmo e-mail criam uma conta só

**C10** - O banco recusa um `user` sem `healthConsentVersion`, sem `healthConsentAcceptedAt` ou sem `phone` (NOT NULL), e um segundo `user` com o mesmo `email` (unique) (AC 2, AC 5)
Proof: run api | ✔ C10 schema recusa usuário sem consentimento ou com e-mail repetido

**C11** - `/cadastro` mostra os campos rotulados "Nome", "E-mail", "Telefone" e "Senha", o termo versão `saude-v1` e a caixa desmarcada "Li e aceito o termo de consentimento para tratamento de dados de saúde" (AC 7)
Proof: walk - abrir `/cadastro` e ler rótulos, termo e estado da caixa

**C12** - Preencher `/cadastro` com dados válidos, marcar o termo e usar "Criar conta" leva a `/minha-conta` com o nome da pessoa (AC 8)
Proof: walk - cadastrar uma conta nova pelo formulário

**C13** - Usar "Criar conta" sem marcar o termo mantém `/cadastro`, mostra "O consentimento para dados de saúde é obrigatório." junto à caixa, mantém nome, e-mail e telefone, esvazia a senha, e nenhuma conta passa a existir para o e-mail (AC 9)
Proof: walk - enviar sem marcar o termo e depois tentar entrar com o mesmo e-mail

**C14** - Com e-mail já cadastrado, `/cadastro` mostra "Este e-mail já está cadastrado." e o link "Entrar" para `/entrar` (AC 10)
Proof: walk - cadastrar de novo com o e-mail usado em C12

**C15** - Com formato inválido, `/cadastro` mostra uma mensagem junto a cada campo devolvido em `fields` e o foco vai ao primeiro campo inválido (AC 11)
Proof: walk - enviar senha de 7 caracteres e e-mail sem arroba, desligando a validação do navegador

**C16** - Com a API fora do ar ou sem responder em 5 s, `/cadastro` e `/entrar` mostram "Não foi possível concluir agora. Tente novamente em instantes." sem redirecionar nem gravar cookie (AC 12)
Proof: walk - enviar os dois formulários com `API_BASE_URL` apontando para uma porta fechada, para um servidor que nunca responde e para a API com o banco fora (503)

### S2 - Login, sessão e saída

**C17** - `POST /api/sessions` com e-mail `"MARIA@Exemplo.com"` e senha corretos responde `200` com `{ id, name, email, phone }` e o mesmo `Set-Cookie` de C1 (AC 13)
Proof: run api | ✔ C17 login correto responde 200 com o paciente e cookie

**C18** - E-mail inexistente e senha errada respondem ambos `401 invalid_credentials` com a mesma `message` e sem `Set-Cookie` (AC 14)
Proof: run api | ✔ C18 login errado responde 401 igual para e-mail inexistente e senha errada

**C19** - `POST /api/sessions` com e-mail sem arroba ou senha vazia responde `400 validation_failed` com `fields` (Surface)
Proof: run api | ✔ C19 login com formato inválido responde 400

**C20** - Para o mesmo e-mail, a 5ª tentativa errada em 60 s responde `401`, a 6ª com senha correta responde `429 rate_limited` com `Retry-After`, outro e-mail na mesma janela responde `200`, 30 s depois ainda `429`, e 60 s depois da 6ª responde `200` (AC 15; bloqueio de 60 s a partir da 6ª)
Proof: run api | ✔ C20 sexta tentativa em 60 s por e-mail responde 429

**C21** - `GET /api/patients/me` com cookie válido responde `200` com `{ id, name, email, phone }` iguais aos do cadastro (AC 16)
Proof: run api | ✔ C21 /me com sessão válida devolve o dono da sessão

**C22** - `GET /api/patients/me` sem cookie, com token desconhecido, com cookie adulterado em um caractere, com `expiresAt` 1 s no passado e com sessão revogada responde `401 unauthenticated` (AC 17)
Proof: run api | ✔ C22 /me sem sessão válida responde 401

**C23** - `DELETE /api/sessions/current` com sessão responde `204`, apaga a sessão no banco e devolve o cookie com `Max-Age=0`; o mesmo cookie em `/me` recebe `401`; sem cookie também responde `204` (AC 18)
Proof: run api | ✔ C23 saída revoga a sessão e expira o cookie

**C24** - Entrar em `/entrar` com credenciais corretas leva a `/minha-conta` com nome, e-mail e telefone (AC 19)
Proof: walk - entrar com a conta de C12

**C25** - Credenciais erradas em `/entrar` mostram "E-mail ou senha incorretos.", mantêm o e-mail e esvaziam a senha (AC 20)
Proof: walk - entrar com senha errada

**C26** - Com a API respondendo `429`, `/entrar` mostra "Muitas tentativas. Aguarde um minuto e tente novamente." (AC 21)
Proof: walk - errar a senha seis vezes seguidas

**C27** - Sem sessão, abrir `/minha-conta` leva a `/entrar` (AC 22)
Proof: walk - abrir `/minha-conta` numa janela sem cookie

**C28** - "Sair" em `/minha-conta` leva a `/entrar`, e abrir `/minha-conta` de novo leva a `/entrar` (AC 23)
Proof: walk - usar "Sair" e reabrir `/minha-conta`

**C29** - Com sessão, abrir `/entrar` ou `/cadastro` leva a `/minha-conta` (AC 24)
Proof: walk - abrir as duas páginas logado

**C30** - `/` mostra os links "Entrar" para `/entrar` e "Criar conta" para `/cadastro`, e o estado da API continua aparecendo (AC 25)
Proof: walk - abrir `/` e seguir os dois links

**C31** - Na origem do Next o cookie de sessão é `HttpOnly` (ausente de `document.cookie`) e nenhuma resposta do Next carrega o token no corpo (AC 26)
Proof: walk - depois de entrar, ler `document.cookie` e os atributos do cookie no navegador

### S3 - Identidade do paciente vem só da sessão

**C32** - Com o cookie da Maria, `GET /api/patients/me?patientId=<id do João>` e com header `x-patient-id: <id do João>` devolvem os dados da Maria (AC 27)
Proof: run api | ✔ C32 identidade vem só da sessão, ignorando o id enviado pelo cliente

**C33** - Com o cookie da Maria, `GET /api/patients/<id do João>` responde `404 not_found` e o corpo não contém nome, e-mail nem telefone do João (AC 28)
Proof: run api | ✔ C33 não existe rota de paciente por id

### S4 - Operação e falhas

**C34** - A API compilada encerra com código diferente de zero antes de escutar quando falta `DATABASE_URL`, falta `BETTER_AUTH_SECRET` ou o segredo tem 31 caracteres; a mensagem nomeia a variável e não contém o valor (AC 29)
Proof: run api | ✔ C34 API não inicia sem configuração obrigatória

**C35** - Com o banco inacessível, cadastro, login e `/me` respondem `503 service_unavailable` e nenhum `Set-Cookie` (AC 30)
Proof: run api | ✔ C35 banco inacessível responde 503 sem criar sessão

**C36** - Com o banco inacessível, `GET /api/health` responde `200` (AC 31)
Proof: run api | ✔ C36 saúde responde 200 com o banco inacessível

**C37** - Rota desconhecida responde `404` com corpo válido em `apiErrorSchema` e `code: "not_found"` (AC 32)
Proof: run api | ✔ C37 rota desconhecida responde 404 no formato de erro

**C38** - A saída de log da API durante um cadastro, um login errado, um login certo e um `/me` não contém a senha usada nem o valor do token de sessão (AC 33)
Proof: run api | ✔ C38 logs não contêm senha nem token

**C39** - Toda resposta de erro das rotas da Surface é válida em `apiErrorSchema` (Landing door 5)
Proof: run api | ✔ C39 erros das rotas seguem o contrato de erro

**C40** - O build de produção sobe com Postgres, cadastra e entra pela API, lê `/me` pela API e `/minha-conta` pelo Next com o cookie, confere o 307 sem sessão e mostra a página inicial com e sem API (smoke, prova a porta 2 compilada em CommonJS; cadastro e login pelas Server Actions são C12 e C24)
Proof: `npm run smoke`

**C41** - O schema Zod de cadastro do pacote de contratos aceita os exemplos válidos de C2 e recusa os inválidos de C6 com os mesmos campos (AC 4)
Proof: run contracts | ✔ C41 schema de cadastro aceita e recusa os exemplos do plano

**C42** - `DELETE /api/sessions/current` com cookie válido e banco inacessível responde `503 service_unavailable`, e a sessão continua no banco para ser revogada depois (Verifier, achado 1)
Proof: run api | ✔ C42 saída com banco inacessível responde 503 e não finge sucesso

**C43** - `GET /api/patients/me` não renova a sessão: `expiresAt` fica igual e não há `Set-Cookie` (Verifier, achado 2)
Proof: run api | ✔ C43 sessão não é renovada por uso: vence 7 dias após o login

**C44** - Com cookie e a API fora do ar, `/minha-conta` responde 200 com "Não foi possível carregar sua conta agora. Tente novamente em instantes." (Verifier, achado 7)
Proof: walk - abrir `/minha-conta` com cookie e `API_BASE_URL` em porta fechada

## Coverage

| Set (size)                                                           | Member -> proof                                                                                                                                                 | Unproven |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `POST /api/patients` statuses (5)                                    | 201 C1 · 400 C6 · 409 C7 · 422 C4 · 503 C35                                                                                                                     | -        |
| `POST /api/sessions` statuses (5)                                    | 200 C17 · 400 C19 · 401 C18 · 429 C20 · 503 C35                                                                                                                 | -        |
| `DELETE /api/sessions/current` statuses (1)                          | 204 C23                                                                                                                                                         | -        |
| `GET /api/patients/me` statuses (3)                                  | 200 C21 · 401 C22 · 503 C35                                                                                                                                     | -        |
| `/cadastro`, `/entrar` statuses (2)                                  | 200 C11 · 307 C29                                                                                                                                               | -        |
| `/minha-conta` statuses (2)                                          | 200 C24 · 307 C27                                                                                                                                               | -        |
| consentimento recusado, AC 3 (4 examples)                            | ausente C4 · `false` C4 · `"saude-v0"` C4 · formato inválido primeiro C5                                                                                        | -        |
| formato do cadastro, AC 4 (9 examples)                               | senha 7 C6 · senha 8 C6 · senha 128 C6 · senha 129 C6 · nome espaços C6 · nome 1 caractere C6 · e-mail sem arroba C6 · telefone 9 dígitos C6 · nome e e-mail C6 | -        |
| normalização, AC 1 (3 examples)                                      | e-mail C2 · celular C2 · fixo C2                                                                                                                                | -        |
| sessão inválida, AC 17 (5 members)                                   | sem cookie C22 · token desconhecido C22 · cookie adulterado C22 · expirada C22 · revogada C22                                                                   | -        |
| limite de login, AC 15 (4 examples)                                  | 5ª errada 401 C20 · 6ª correta 429 C20 · outro e-mail 200 C20 · após 60 s 200 C20                                                                               | -        |
| configuração obrigatória, AC 29 (3 members)                          | sem `DATABASE_URL` C34 · sem `BETTER_AUTH_SECRET` C34 · segredo de 31 caracteres C34                                                                            | -        |
| startup config: `DATABASE_URL` e `BETTER_AUTH_SECRET` (3 assemblies) | entrada `main.ts` C34 · harness de teste `createApp` C1 · smoke do build C40                                                                                    | -        |
| Landing doors (6)                                                    | 1 banco C10 · 2 biblioteca C1, C40 · 3 cookie C1, C31 · 4 tabela `user` C3, C10 · 5 contrato de erro C39 · 6 limite C20                                         | -        |
| entidades novas (4)                                                  | `user` C3 · `account` C8 · `session` C23 · `verification` C10 (migration aplicada)                                                                              | -        |
| falha da API vista pelo Next, AC 12 (3 members)                      | fora do ar C16 · sem resposta em 5 s C16 · `503` C16                                                                                                            | -        |
| mensagens de tela por código (5)                                     | `consent_required` C13 · `email_in_use` C14 · `validation_failed` C15 · `invalid_credentials` C25 · `rate_limited` C26                                          | -        |
| identidade enviada pelo cliente, AC 27 (2 members)                   | query `patientId` C32 · header `x-patient-id` C32                                                                                                               | -        |

- Claims naming a status code, route or response shape: C1-C10, C17-C23, C32-C39 - each has a proof that crosses HTTP into the running Nest app and the real Postgres
- No other check claims more than the single case its proof exercises

## Swept

- validation: C5, C6, C19, C41
- failure modes: C4, C35, C16
- idempotency: C23 (saída repetida e sem sessão responde 204), C7 (cadastro repetido não altera a conta)
- authorization: C20, C22, C32, C33, C27
- concurrency: C9
- data lifecycle: C21 (o que foi cadastrado volta igual em `/me`); exclusão e retenção n/a - RN-13 fora de escopo no plano
- dependency failure: C35, C36, C16
- state transitions: C22 (sessão expirada e revogada), C23 (ativa -> revogada)
- observability: C38

## Handoff

- **Settled mid-build:** 2026-11-08 - usuário: "Adote a recomendação: a F1 entrega SessionGuard e a convenção 404, e o cenário Maria/João vira critério da F4"; "Para o termo LGPD use texto placeholder claramente marcado, sem inventar texto jurídico, e deixe isso registrado como pendência"; "Prove o risco ESM x CommonJS no primeiro commit"; "commits e PRs autorizados. Trabalhe numa branch feat/f1-patient-auth (não na main), faça commits pequenos e convencionais após npm run check e build verdes, sem tocar em graphify-out/, sem force push e sem merge. Não abra o PR você mesmo"
- **Dispatched:** Verifier (sub-agente independente) em 2026-11-08 sobre `HEAD` `b8a2065`, diff `55ead55..b8a2065` - returned (7 achados)
- **Boundary:** C1-C41 closed at `073a9a6` (API e contratos em `0cfd15d`, web e smoke em `adea3ae`, docs em `073a9a6`)
- **Abandoned:** `prisma migrate reset --force` antes da suíte - o Prisma recusa o comando quando chamado por agente sem consentimento explícito do usuário; trocado por `prisma migrate deploy` + `TRUNCATE` por teste (nota em `## Landing` do plano). Prova ESM x CommonJS: `require('better-auth')` e `tsc` em CommonJS passaram antes de qualquer código; o commit `0cfd15d` a mantém pela suíte HTTP compilada em CommonJS e pelo smoke do `dist`
- **Walked:** 2026-11-08, C44 após o Verifier: `next start` com `API_BASE_URL` em porta fechada e cookie de sessão - `/minha-conta` 200 com "Não foi possível carregar sua conta agora. Tente novamente em instantes.". Antes, `npm run dev` (Next 3000, Nest 3001, Postgres de dev) no Chromium do Playwright. C30: `/` mostra "Entrar" (`/entrar`) e "Criar conta" (`/cadastro`) e "API conectada"; o link "Criar conta" abre `/cadastro`. C11: `/cadastro` mostra Nome, E-mail, Telefone, Senha, o termo "TEXTO PROVISÓRIO - termo jurídico pendente · versão saude-v1" e a caixa desmarcada com o rótulo do plano. C13: enviado sem marcar o termo - fica em `/cadastro`, mensagem "O consentimento para dados de saúde é obrigatório.", nome/e-mail/telefone mantidos, senha vazia, foco na caixa, e `select count(*)` do e-mail no banco = 0. C12: marcado o termo e "Criar conta" - `/minha-conta` com "Olá, Ana Walk". C31: `document.cookie` vazio; cookie `better-auth.session_token` HttpOnly, SameSite Lax, Path /, 7 dias (Secure só em produção); o token não aparece no HTML nem no payload RSC de `/minha-conta`. C29: logada, `/entrar` e `/cadastro` levam a `/minha-conta`. C28: "Sair" leva a `/entrar`, cookie removido, 0 sessões da conta no banco, e reabrir `/minha-conta` leva a `/entrar`. C27: sem cookie, `/minha-conta` responde 307 para `/entrar`. C25: senha errada - "E-mail ou senha incorretos.", e-mail mantido, senha vazia. C24: senha certa - `/minha-conta` com nome, e-mail e "(11) 98765-4321". C14: cadastro com "ANA.walk@exemplo.com" - "Este e-mail já está cadastrado." com link "Entrar" para `/entrar`. C15: com `noValidate`, senha de 7 e e-mail sem arroba - "Informe um e-mail válido." e "A senha deve ter de 8 a 128 caracteres." junto aos campos, foco no e-mail. C26: seis tentativas erradas seguidas - a partir da 6ª do e-mail na janela de 60 s (duas vieram de C24/C25) aparece "Muitas tentativas. Aguarde um minuto e tente novamente.". C16 (build de produção do Next): `API_BASE_URL` em porta fechada - mensagem em 0,2 s; servidor que aceita e não responde - mensagem em 5,4 s; API real com banco fora respondendo 503 - mesma mensagem; nos três, `/cadastro` e `/entrar` sem redirect e 0 cookies. Largura 375 px: `/`, `/cadastro` e `/entrar` sem rolagem horizontal. O usuário chega a cada estado pela home: "Criar conta" → `/cadastro`, "Entrar" → `/entrar`, cadastro ou login → `/minha-conta`, "Sair" → `/entrar`
