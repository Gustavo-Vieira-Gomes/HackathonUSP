---
paths:
  - 'apps/api/**'
---

# API Nest

Aplicar junto às regras globais de `.claude/rules/` e ao perfil ativo em `docs/architecture/ACTIVE.md`.

- Siga `docs/architecture/structure.md` na raiz para localização de arquivos, convenções e crescimento das funcionalidades. As pastas planejadas só devem ser criadas com conteúdo real.
- Use módulos por funcionalidade, controllers pequenos e serviços para casos de uso. Evite camadas vazias, CQRS e abstrações sem uma necessidade concreta.
- Controllers traduzem HTTP e serviços implementam os fluxos. Use @Injectable(), decorators e injeção por construtor normalmente; aproveite pipes, guards, interceptors, filtros e providers nativos. Serviços podem acessar o ORM diretamente. Não exigir classes sem framework, portas, repositórios ou uma classe por operação. Não importar código do Next.
- Compartilhe contratos públicos em `@hackathon/contracts`; nunca importe código de `apps/web`. Não coloque modelos de persistência ou segredos no pacote compartilhado.
- Valide entradas externas no servidor com schemas de contrato. Tipos TypeScript não validam dados em runtime. Ao adicionar autenticação, faça autorização por operação/recurso.
- O endpoint `/api/health` é liveness do processo. Não representa readiness de banco, autenticação ou fornecedores.
- Não habilite CORS irrestrito. O frontend inicial chama a API no servidor; só configure origens explícitas quando houver acesso direto do navegador.
- A possível migração para Next full stack não restringe o uso do Nest agora. Se ativada, adapte serviços, DI, decorators, pipes e guards para os mecanismos do Next, preservando comportamento e testes. Não mantenha duas versões da mesma regra.
- Teste regras críticas e limites externos. Testes HTTP devem usar porta efêmera e sempre fechar a aplicação.

Comandos a partir da raiz: `npm run build --workspace @hackathon/api`, `npm run typecheck --workspace @hackathon/api`, `npm run lint --workspace @hackathon/api`, `npm run test --workspace @hackathon/api`. O pacote de contratos deve estar compilado antes.

Os testes Nest compilam com tsc antes do node:test, preservando emitDecoratorMetadata e o comportamento de injeção de dependências. Não trocar por um transpiler que omita metadata sem configurar a DI explicitamente.
