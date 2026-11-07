# Perfil ativo: Next + Nest

Status: ativo. Arquitetura convencional do Nest, organizada por funcionalidade e usando os recursos nativos do framework. Velocidade de entrega tem prioridade sobre isolamento de framework para uma migração hipotética. Aplicações `apps/web` e `apps/api`, contrato `packages/contracts`.

Next renderiza interface e acessa Nest no servidor via API_BASE_URL. Nest é dono de regras e persistência. Contratos compartilhados não carregam domínio nem infraestrutura. Rotas técnicas como saúde do próprio Next são permitidas. Ainda não há banco, autenticação, fila ou requisito de produto definido.

Leia `next-nest.md` para este perfil. `next-fullstack.md` é o plano alternativo inativo. Mudar perfil exige decisão explícita, migração dos fluxos existentes e atualização de comandos/CI/docs; não basta trocar este título.

Estrutura de pastas e responsabilidades: [structure.md](structure.md). Árvores planejadas não significam recursos já implementados.
