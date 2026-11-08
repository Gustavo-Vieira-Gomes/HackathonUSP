# Hackathon USP

Base full stack com **Next + Nest**, TypeScript e npm workspaces. Produto e funcionalidades serão definidos depois; este scaffold fornece aplicações mínimas e harness de desenvolvimento.

## Começar

Recomendado: Node 24 LTS (`nvm use`) e npm.

```sh
npm ci
npm run dev
```

- Web: http://localhost:3000
- Saúde Next: http://localhost:3000/api/health
- Saúde Nest: http://localhost:3001/api/health

A página inicial consulta a API no servidor e mostra seu estado real. Defaults locais funcionam sem .env; para customizar, veja `apps/web/.env.example` e `apps/api/.env.example`. Arquivos .env não são versionados. O script dev recompila contratos antes de iniciar; alterações posteriores no pacote exigem recompilação e reinício.

```sh
npm run dev:web       # apenas Next, API aparece indisponível se desligada
npm run check         # lint, tipos, testes e formatação
npm run build         # builds de produção em ordem
npm run smoke         # após build: HTTP real, integração e API desligada
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

Banco, login, autorização, fila, WebSocket e deploy ainda não estão implementados. Saúde atual é liveness; não comprova prontidão dessas futuras dependências.

## Validação

Checks, builds e smoke HTTP verificados com Node 24. Veja [evidências e limites](docs/verification.md), incluindo o override transitivo de segurança e os alertas restantes de ferramentas de desenvolvimento.

## Referências

[Next: instalação](https://nextjs.org/docs/app/getting-started/installation), [Next: backend](https://nextjs.org/docs/app/guides/backend-for-frontend), [Nest: primeiros passos](https://docs.nestjs.com/first-steps), [Claude: memória e instruções](https://code.claude.com/docs/en/memory).
