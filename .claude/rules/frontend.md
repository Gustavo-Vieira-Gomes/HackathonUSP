---
paths:
  - 'apps/web/**'
---

# Web — Next.js

Aplicar junto às regras globais de `.claude/rules/` e ao perfil ativo em `docs/architecture/ACTIVE.md`.

- Siga `docs/architecture/structure.md` na raiz para localização de arquivos, convenções e crescimento das funcionalidades. As pastas planejadas só devem ser criadas com conteúdo real.
- Estrutura baseada no Portal Speedmilhas: `app/` para rotas, `core/modules/<feature>/` para screens, componentes, hooks e services; `core/shared/` para recursos reutilizados. Sem `src/` ou `features/` paralelos. Alias `@/` aponta para a raiz de apps/web.
- Páginas simples podem ficar diretamente em `app/.../page.tsx`. Extrair screens quando houver composição relevante. Não exigir uma screen por rota nem criar pastas de módulo antecipadamente; schemas, types, utils, providers e store são opcionais.
- App Router, TypeScript estrito e Server Components por padrão. Use `"use client"` apenas onde há estado, eventos ou APIs do navegador.
- Perfil inicial: Next + Nest. Regras de negócio e persistência pertencem à API; o Next apresenta e adapta os dados. Não importe arquivos internos de `apps/api`.
- Para migrar ao perfil Next full stack, siga o roteiro em `docs/architecture/` na raiz. Coloque casos de uso e acesso a dados em `core/server/`, com `import "server-only"`; páginas, Route Handlers e Server Actions ficam finos.
- Nunca mantenha duas implementações da mesma regra nos dois perfis. Não introduza uma API interna via HTTP para um Server Component chamar lógica do próprio Next.
- Contratos públicos vêm de `@hackathon/contracts`. Valide respostas externas em runtime. Trate falhas e use timeout; não apresente sucesso fictício.
- Segredos e endereços internos ficam no servidor. `NEXT_PUBLIC_*` é público. Não confie em validação de formulário para autorização.
- Use HTML semântico, labels, navegação por teclado, foco visível e estados de carregamento, vazio e erro quando aplicáveis. Conteúdo da interface em português.
- Sem chamadas de rede no build, fontes externas obrigatórias ou dados de demonstração apresentados como reais.
- Verificação: `npm run lint --workspace @hackathon/web`, `npm run typecheck --workspace @hackathon/web` e `npm run build --workspace @hackathon/web`. Testes de comportamento devem cobrir fluxos relevantes quando existirem.
