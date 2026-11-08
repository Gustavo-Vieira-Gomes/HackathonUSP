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

## Dados de demonstração (HACK-15)

Com Postgres **local exclusivo** e migrations aplicadas (`npm run db:deploy -w @hackathon/api`), configure em `apps/api/.env`: `NODE_ENV=development`, `DEMO_SEED_ENABLED=true` e `DATABASE_URL` local. Compile contratos e gere o client (`npm run build -w @hackathon/contracts` e `npm run db:generate -w @hackathon/api`), depois rode `npm run seed`. Repetir mantém as identidades e não duplica dados.

O manifesto em `apps/api/src/modules/demo-data/clinics.json` contém dez unidades reais de São Paulo e fontes por campo. Preços, expediente, consentimentos e doze pacientes são **sintéticos de demo**, sem contas de login. Não representam parceria ou oferta das clínicas. RM de joelho: R$ 720, piso R$ 500. As duas clínicas `demoCalendarTarget=true` são alvos para conexão manual, sem OAuth simulado. Questionários HACK-41 continuam pendentes de revisão clínica.

As inscrições cobrem toda a semana e raio de 50 km, com e-mail `.invalid` e WhatsApp sintético. Para visualizar alertas sem contatar pessoas, use `WHATSAPP_MODE=simulated`; o seed não envia mensagens nem configura fornecedores. A execução recusa produção e banco remoto.
