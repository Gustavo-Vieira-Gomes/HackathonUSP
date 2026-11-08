# f1-patient-auth proofs

**HEAD**: 2924815
**Tree**: dirty - graphify-out/
**Shell**: /bin/sh
**Result**: 48 pass, 0 fail

| Check | Proof | Result |
| --- | --- | --- |
| C1 | `run api / ✔ C1 cadastro válido responde 201 com o paciente e cookie de sessão` | pass |
| C2 | `run api / ✔ C2 cadastro normaliza e-mail e telefone` | pass |
| C3 | `run api / ✔ C3 cadastro grava versão e horário do consentimento pelo servidor` | pass |
| C4 | `run api / ✔ C4 cadastro sem consentimento responde 422 e não cria nada` | pass |
| C5 | `run api / ✔ C5 formato inválido tem precedência sobre consentimento` | pass |
| C6 | `run api / ✔ C6 cadastro com formato inválido responde 400 com os campos` | pass |
| C7 | `run api / ✔ C7 e-mail já cadastrado responde 409 sem alterar a conta` | pass |
| C8 | `run api / ✔ C8 senha nunca é gravada nem devolvida em texto` | pass |
| C9 | `run api / ✔ C9 cadastros simultâneos do mesmo e-mail criam uma conta só` | pass |
| C10 | `run api / ✔ C10 schema recusa usuário sem consentimento ou com e-mail repetido` | pass |
| C11 | `walk - abrir /cadastro e ler rótulos, termo e estado da caixa` | pass (Walked) |
| C12 | `walk - cadastrar uma conta nova pelo formulário` | pass (Walked) |
| C13 | `walk - enviar sem marcar o termo e depois tentar entrar com o mesmo e-mail` | pass (Walked) |
| C14 | `walk - cadastrar de novo com o e-mail usado em C12` | pass (Walked) |
| C15 | `walk - enviar senha de 7 caracteres e e-mail sem arroba, desligando a validação do navegador` | pass (Walked) |
| C16 | `walk - enviar os dois formulários com API_BASE_URL apontando para uma porta fechada, para um servidor que nunc` | pass (Walked) |
| C17 | `run api / ✔ C17 login correto responde 200 com o paciente e cookie` | pass |
| C18 | `run api / ✔ C18 login errado responde 401 igual para e-mail inexistente e senha errada` | pass |
| C19 | `run api / ✔ C19 login com formato inválido responde 400` | pass |
| C20 | `run api / ✔ C20 sexta tentativa em 60 s por e-mail responde 429` | pass |
| C21 | `run api / ✔ C21 /me com sessão válida devolve o dono da sessão` | pass |
| C22 | `run api / ✔ C22 /me sem sessão válida responde 401` | pass |
| C23 | `run api / ✔ C23 saída revoga a sessão e expira o cookie` | pass |
| C24 | `walk - entrar com a conta de C12` | pass (Walked) |
| C25 | `walk - entrar com senha errada` | pass (Walked) |
| C26 | `walk - errar a senha seis vezes seguidas` | pass (Walked) |
| C27 | `walk - abrir /minha-conta numa janela sem cookie` | pass (Walked) |
| C28 | `walk - usar "Sair" e reabrir /minha-conta` | pass (Walked) |
| C29 | `walk - abrir as duas páginas logado` | pass (Walked) |
| C30 | `walk - abrir / e seguir os dois links` | pass (Walked) |
| C31 | `walk - depois de entrar, ler document.cookie e os atributos do cookie no navegador` | pass (Walked) |
| C32 | `run api / ✔ C32 identidade vem só da sessão, ignorando o id enviado pelo cliente` | pass |
| C33 | `run api / ✔ C33 não existe rota de paciente por id` | pass |
| C34 | `run api / ✔ C34 API não inicia sem configuração obrigatória` | pass |
| C35 | `run api / ✔ C35 banco inacessível responde 503 sem criar sessão` | pass |
| C36 | `run api / ✔ C36 saúde responde 200 com o banco inacessível` | pass |
| C37 | `run api / ✔ C37 rota desconhecida responde 404 no formato de erro` | pass |
| C38 | `run api / ✔ C38 logs não contêm senha nem token` | pass |
| C39 | `run api / ✔ C39 erros das rotas seguem o contrato de erro` | pass |
| C40 | `npm run smoke` | pass |
| C41 | `run contracts / ✔ C41 schema de cadastro aceita e recusa os exemplos do plano` | pass |
| C42 | `run api / ✔ C42 saída com banco inacessível responde 503 e não finge sucesso` | pass |
| C43 | `run api / ✔ C43 sessão não é renovada por uso: vence 7 dias após o login` | pass |
| C44 | `walk - abrir /minha-conta com cookie e API_BASE_URL em porta fechada` | pass (Walked) |
| Build | `npm run build` | pass |
| Build | `npm run lint` | pass |
| Build | `npm run typecheck` | pass |
| Build | `npm run format:check` | pass |

## Output

`Run api` - exit 0

```
✔ C21 /me com sessão válida devolve o dono da sessão (123.766264ms)
✔ C22 /me sem sessão válida responde 401 (241.151582ms)
✔ C32 identidade vem só da sessão, ignorando o id enviado pelo cliente (206.897547ms)
✔ C33 não existe rota de paciente por id (207.935499ms)
ℹ tests 29
ℹ suites 0
ℹ pass 29
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 9693.235968
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma/schema.prisma.
```

`Run contracts` - exit 0

```
> @hackathon/contracts@0.1.0 test
> tsx --test src/*.test.ts

✔ rejeita um serviço indisponível declarado como saudável (2.807852ms)
✔ aceita resposta de saúde de ambos os adaptadores (0.274002ms)
✔ C41 schema de cadastro aceita e recusa os exemplos do plano (7.081745ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 285.353718
```

`npm run smoke` - exit 0

```
> hackathon-usp@0.1.0 smoke
> node scripts/smoke.mjs

Smoke HTTP passou: saúde Next/Nest, cadastro, login e /me na API, /minha-conta pelo Next, integração e fallback com API desligada.
```
