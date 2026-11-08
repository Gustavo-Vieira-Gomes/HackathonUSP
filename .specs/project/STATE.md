# Estado

Perfil ativo: Next + Nest. Alternativo: Next full stack, plano em docs/architecture/next-fullstack.md. Usar uma base Next, sem duplicar aplicação.

Decisão de arquitetura: padrões nativos do Nest e módulos por funcionalidade; decorators e DI são parte normal dos serviços. Sem obrigação de Clean Architecture/hexagonal ou portabilidade de serviços. A migração para Next full stack exigirá adaptação se for escolhida.

Decisões: npm workspaces para reduzir ferramentas; contratos Zod independentes; domínio e infraestrutura só quando houver requisitos; nenhuma publicação ou commit automático.

Pendências de produto: tema, público, prazo, requisitos da banca, integrações, hospedagem, banco e autenticação.

Bootstrap concluído e validado com Node 24.22.2. Checks, builds e smoke HTTP passaram. Evidências e limites em docs/verification.md; 12 alertas apenas de desenvolvimento permanecem na auditoria completa. CI ainda não executado remotamente.

Estrutura planejada em docs/architecture/structure.md: Next com app/core/modules/core/shared; Nest com módulos por funcionalidade e recursos comuns extraídos por uso; contratos de transporte compartilhados. Criar diretórios sob demanda. Documento registra também os ajustes de descoberta de testes necessários ao adicionar arquivos em subpastas.

Frontend alinhado à estrutura atual do Portal Speedmilhas, inspecionada localmente: app e core na raiz, sem src. Tela inicial em core/modules/initial-page/screens; consulta de saúde em core/shared/services. Contratos continuam no workspace compartilhado.

Estrutura frontend aprovada: organização simplificada do Portal. Páginas simples podem permanecer em app; screens e subpastas dos módulos são extraídas conforme necessidade, sem estrutura obrigatória por rota.

Políticas centralizadas em .claude/rules: project, engineering, security e design-patterns globais; frontend/backend/contracts com frontmatter paths. AGENTS e CLAUDE são pontos de entrada para a mesma fonte. Extração na segunda ocorrência da mesma regra com invariantes comuns; regras sensíveis têm dono único desde a primeira implementação. Padrões adotados por necessidade concreta, preservando os recursos nativos do Nest.

## Decisões — HACK-15

- Retomada do handoff 909a786; integrar main e preservar cadastro/login/exames/agenda atuais. A busca web/API extra do WIP sai desta entrega por não fazer parte do card.
- São Paulo conforme manifesto já pesquisado; manter proveniência por clínica. Preços/expediente/canais e consentimentos são sintéticos de demonstração.
- `demoCalendarTarget` só marca duas clínicas para conexão futura. Não criar tokens nem conexões Google falsas.
- IDs gerados pelo Prisma: acrescentar default uuid() client-side ao User.id (Better Auth continua podendo informar seu próprio id); usar chaves naturais para idempotência.
- Catálogo HACK-17 é a fonte TUSS. Não semear abdome total com protocolo de abdome superior; excluir o TC de tórax fora da lista fechada vigente.
- Substituir testes WIP de rotas retiradas por provas do seed, sem enfraquecer testes já presentes em main.
- HACK-15 concluído no worktree: seed duplo, matching SQL com 12 candidatos, 10 clínicas/2 alvos; check 409 testes, build e smoke verdes. Publicação em PR para main, revisão/merge ficam com a esteira do maestro.
