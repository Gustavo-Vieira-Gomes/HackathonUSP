# Hackathon USP

Base full stack com **Next + Nest**, TypeScript e npm workspaces. Produto e funcionalidades serão definidos depois; este scaffold fornece aplicações mínimas e harness de desenvolvimento.

## Começar

Recomendado: Node 24 LTS (`nvm use`) e npm.

```sh
npm ci
cp .env.example .env                  # porta e banco do Postgres deste worktree
cp apps/api/.env.example apps/api/.env  # DATABASE_URL, BETTER_AUTH_*, WEB_ORIGIN
docker compose up -d --wait           # Postgres local (um container e volume por worktree)
npm run db:migrate -w @hackathon/api  # aplica as migrations do Prisma no banco local
npm run dev
```

- Web: http://localhost:3000
- Saúde Next: http://localhost:3000/api/health
- Saúde Nest: http://localhost:3001/api/health

A página inicial consulta a API no servidor e mostra seu estado real e a sessão. A API não sobe sem `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ caracteres), `BETTER_AUTH_URL` e `WEB_ORIGIN`; veja `apps/api/.env.example` e `apps/web/.env.example`. Arquivos .env não são versionados. O script dev recompila contratos antes de iniciar; alterações posteriores no pacote exigem recompilação e reinício.

```sh
npm run dev:web       # apenas Next, API aparece indisponível se desligada
npm run check         # lint, tipos, testes e formatação
npm run build         # builds de produção em ordem
npm run smoke         # após build, com o Postgres de pé: HTTP real, cadastro/login pelo Next e API desligada
npm run format        # formatação
```

Após build, execute `npm run start -w @hackathon/api` e `npm run start -w @hackathon/web` em terminais separados. Interrompa dev antes de rodar builds para evitar disputa no .next.

## Estrutura e harness

- `apps/web`: interface Next App Router.
- `apps/api`: API Nest e futuro dono dos casos de uso.
- `packages/contracts`: schemas Zod e tipos compartilhados.
- [Rules do Claude](.claude/rules/): fonte de verdade das políticas. [AGENTS.md](AGENTS.md) e CLAUDE.md orientam a leitura das mesmas regras.
- [Engenharia](.claude/rules/engineering.md), [segurança](.claude/rules/security.md) e [extração e padrões de projeto](.claude/rules/design-patterns.md): regras globais; frontend, backend e contratos têm rules com escopo por caminho.
- [Estrutura de pastas e responsabilidades](docs/architecture/structure.md): guia para implementar novas funcionalidades.
- [Perfil ativo](docs/architecture/ACTIVE.md), [Next + Nest](docs/architecture/next-nest.md) e [transição para Next full stack](docs/architecture/next-fullstack.md).
- [Spec BDD do produto](docs/product/marketplace-vagas-imagem.md): fonte de verdade das regras de negócio (`RN-xx`) e cenários.
- [Template de funcionalidade](docs/templates/feature.md), `.specs/project`: planejamento e decisões.

Há uma base de código e dois perfis de harness. O perfil alternativo fica inativo até a decisão de migrar; não existe segunda aplicação duplicada para sincronizar. npm workspaces descobre os pacotes; a transição ainda exige adaptar fluxos, scripts e remover referências conforme checklist.

Fundação (HACK-12): Postgres + Prisma, Better Auth no Nest com cookie httpOnly no domínio do Next (repasse em `/api/auth/*` e `/api/sign-up/{paciente,clinica}`), guard global (rota nova nasce protegida; pública usa `@AllowAnonymous()`), `@nestjs/schedule` e socket.io com job e gateway de exemplo. Fila e deploy ainda não existem. Saúde atual é liveness; não comprova prontidão do banco.

## Validação

Checks, builds e smoke HTTP verificados com Node 24. Veja [evidências e limites](docs/verification.md), incluindo o override transitivo de segurança e os alertas restantes de ferramentas de desenvolvimento.

## Referências

[Next: instalação](https://nextjs.org/docs/app/getting-started/installation), [Next: backend](https://nextjs.org/docs/app/guides/backend-for-frontend), [Nest: primeiros passos](https://docs.nestjs.com/first-steps), [Claude: memória e instruções](https://code.claude.com/docs/en/memory).

## Pacientes (HACK-23)

Cadastro em `/paciente/cadastro`, login em `/paciente/login` e área autenticada em `/paciente`. O cadastro usa Better Auth pela rota existente `POST /api/sign-up/paciente`, agora com `name`, `email`, `password`, `phone` (dígitos e `+` opcional) e `healthDataConsent: true`. Sem aceite: 422 `consentimento obrigatório`, sem criar conta. O perfil registra o instante do aceite no servidor.

`GET /api/patient/reservations/:id` e `GET /api/patient/subscriptions/:id` resolvem o paciente pela sessão e respondem 404 para recurso alheio ou inexistente. Novas operações de paciente devem usar `@PatientOnly()` e filtrar por `@CurrentPatientId()`. O job de retenção roda a cada minuto usando `ClockService.now()`: remove reservas a partir de 30 dias após o fim do exame e inscrições a partir de 30 dias após expiração, junto dos dependentes identificáveis. A conta e o registro do consentimento permanecem.

HACK-23: cadastro e login do paciente em `/paciente/cadastro` e `/paciente/login`, com telefone e consentimento obrigatório para dados de saúde. A conta autenticada acessa seus registros por `/paciente/reservas/<id>` e `/paciente/inscricoes/<id>`; registros inexistentes ou de outro paciente respondem não encontrado sem exibir dados.

## Lista de encaixe do paciente (HACK-24)

Após login em `/paciente`, acesse `/paciente/inscricoes/nova`: escolha exame,
endereço ou localização e raio, preço máximo e janelas no fuso de São Paulo.
“Posso ir hoje” exige localização atual. Uma nova inscrição para o mesmo exame
atualiza a existente. O matching usa as mesmas regras das ondas de alerta e
encaminha ao link `/paciente/vagas/:id` se já houver vaga compatível.

Em `/paciente/inscricoes`, veja clínicas na região e renove a mesma inscrição por
30 dias. O relógio da aplicação determina a expiração; o job por minuto envia
um link para essa tela quando o e-mail estiver configurado. Sem credenciais de
Resend, nenhum e-mail é enviado. Aceite, reserva comum, foto do pedido e permissão
push são pontos de integração com os cards responsáveis.
