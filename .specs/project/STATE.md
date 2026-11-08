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

## Decisões HACK-19

Autorizado pelo Gustavo: execução sem aprovação entre etapas, commits/push/PR main e aviso ao maestro; sem merge pelo implementador. Slots comuns em fatias de 30 minutos porque Exam não define duração. Snapshot completo antes de efeitos; falha de API suspende conexão e não usa leitura parcial. Nenhuma mudança em Vacancy.slotId ou Exam.clinicId. Banco local isolado hack_19 na porta 54319.

HACK-19 validado: check (429 testes, zero falhas/ignorados), build e smoke verdes. Snapshot completo, eventos idempotentes e revalidação da conexão sob trava de clínica. E-mails após commit usam tentativas existentes, sem nova outbox; Google/Resend reais não homologados. Dependências copiadas sem instalar; donor HACK-17 tem package-lock idêntico ao da base.

## Decisões HACK-23

- Autorizado executar a esteira e publicar PR sem pausas. Base HTTPS feat/hack-23-complete resolveu para 0d7ee6e, sem WIP/handoff mencionado no card.
- Reutilizar Better Auth e os proxies existentes; cadastro de paciente passa a exigir telefone e aceite explícito.
- Retenção usa fim do horário do exame para reserva e expiresAt da inscrição; excluir dependentes para não deixar histórico identificável nem FKs bloqueando.

- Prova inicial: quatro cenários HACK-23 da API passaram. Check completo identificou import explícito de ClockModule ausente em AuthModule (consumidor isolado GoogleCalendarModule); corrigido sem alterar o teste existente. Nova página exigiu recompilar contracts antes dos testes frontend.
- Artefatos de navegação e ownership ficam em README e spec; não há descoberta adicional que justifique duplicação em .notebook.

- HACK-23 validado: check (414 testes sem falhas/ignorados), build e smoke verdes no banco hack_23. Inclui páginas por ID e smoke de 404 no Next. Sem dependências/migrations novas e sem deploy.
