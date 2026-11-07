# Entrada para agentes

A fonte de verdade das políticas é **`.claude/rules/`**. Este arquivo apenas orienta a leitura; não mantém uma versão alternativa das regras do Claude.

Antes de planejar ou implementar, leia as quatro rules globais:

- [project.md](.claude/rules/project.md): contexto, comandos, fluxo e limites.
- [engineering.md](.claude/rules/engineering.md): convenções, qualidade e dependências.
- [security.md](.claude/rules/security.md): validação, autorização e segredos.
- [design-patterns.md](.claude/rules/design-patterns.md): extração de duplicação e critérios de uso de padrões.

Leia também as rules aplicáveis aos arquivos que serão alterados:

| Caminho                 | Rule                                       |
| ----------------------- | ------------------------------------------ |
| `apps/web/**`           | [frontend.md](.claude/rules/frontend.md)   |
| `apps/api/**`           | [backend.md](.claude/rules/backend.md)     |
| `packages/contracts/**` | [contracts.md](.claude/rules/contracts.md) |

O frontmatter `paths` é usado pelo Claude. Agentes que não carregam rules automaticamente devem abrir os arquivos explicitamente, aplicar as globais e selecionar as específicas pelos caminhos tocados. Em mudanças entre workspaces, ler todas as específicas correspondentes. Ao adicionar uma rule, atualizar este índice e o CLAUDE.md.

Mapa de pastas: [structure.md](docs/architecture/structure.md). Perfil ativo: [ACTIVE.md](docs/architecture/ACTIVE.md). As instruções do usuário têm prioridade; conflitos entre regras devem ser resolvidos sem ignorar silenciosamente nenhuma delas.
