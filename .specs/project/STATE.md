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

## Decisions

| ID     | Decision                                                                                                                                                                                                                                         | Rationale                                                                                                                                             | Status | Date       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- |
| AD-001 | Banco PostgreSQL 17 com Prisma ORM; schema e migrations em `apps/api/prisma/`, cliente em `apps/api/src/database/`; Postgres local por `compose.yaml`                                                                                            | Porta 1 do plano F1; aprovada pelo usuário ("aprovo as portas 1 a 3"). SQLite rejeitado por RN-41 (trava concorrente); Drizzle era a alternativa viva | active | 2026-11-08 |
| AD-002 | Autenticação por Better Auth usada só no servidor Nest (provider `AUTH` por `useFactory`, adapter Prisma); handler `/api/auth/*` não é montado; o Nest expõe rotas próprias e traduz erros                                                       | Porta 2 do plano F1; aprovada pelo usuário. Proibido criptografia ou sessão própria (`security.md`)                                                   | active | 2026-11-08 |
| AD-003 | Sessão por cookie `better-auth.session_token` HttpOnly, SameSite=Lax, Path=/, 7 dias, emitido pelo Nest e regravado na origem do Next por Server Actions; o Next encaminha só esse cookie ao Nest; o navegador nunca chama o Nest                | Porta 3 do plano F1; aprovada pelo usuário                                                                                                            | active | 2026-11-08 |
| AD-004 | Erros da API no formato `apiErrorSchema = { code, message, fields? }` (`packages/contracts`), aplicado por exception filter global                                                                                                               | Porta 5 do plano F1: contrato consumido pelo Next em todas as funcionalidades                                                                         | active | 2026-11-08 |
| AD-005 | Recurso de paciente: identidade só pela sessão (`SessionGuard`); consulta sempre filtrada pelo id da sessão; ausente ou de outro paciente responde `404 not_found` com o mesmo corpo. O cenário Maria/João de F1 vira critério obrigatório da F4 | Questão 1 do plano F1; usuário: "Adote a recomendação: a F1 entrega SessionGuard e a convenção 404, e o cenário Maria/João vira critério da F4"       | active | 2026-11-08 |

Pendências registradas: texto jurídico do termo de consentimento LGPD para dados de saúde (F1 usa placeholder marcado "TEXTO PROVISÓRIO", versão `saude-v1`); bloqueia go-live, não a demo.
