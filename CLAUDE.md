# Hackathon USP

A fonte de verdade das políticas é `.claude/rules/`. O Claude carrega as rules globais e aplica as específicas conforme o frontmatter `paths`. Não copiar regras para este arquivo ou importar AGENTS.md de volta.

## Rules globais

- `.claude/rules/project.md`: contexto, comandos e fluxo de trabalho.
- `.claude/rules/engineering.md`: engenharia e verificação.
- `.claude/rules/security.md`: segurança.
- `.claude/rules/design-patterns.md`: extração de duplicação e padrões.

## Rules por caminho

- `apps/web/**`: `.claude/rules/frontend.md`.
- `apps/api/**`: `.claude/rules/backend.md`.
- `packages/contracts/**`: `.claude/rules/contracts.md`.

Antes de editar, conferir também `docs/architecture/ACTIVE.md` e `docs/architecture/structure.md`. O AGENTS.md fornece a mesma seleção explícita para outros agentes; regras novas devem ser adicionadas aos dois índices. Arquivos locais de instrução são apenas pontos de entrada, não fontes concorrentes.
