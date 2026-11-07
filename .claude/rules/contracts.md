---
paths:
  - 'packages/contracts/**'
---

# Contratos

Aplicar junto às regras globais de `.claude/rules/`. Este pacote contém schemas de entrada/saída e tipos serializáveis compartilhados. Não importar Next, Nest, banco, variáveis de ambiente ou código de servidor. Validação de permissão e regra de negócio pertence ao servidor responsável, não ao contrato. Mudanças incompatíveis precisam atualizar consumidores e testes na mesma entrega. Execute `npm run build -w @hackathon/contracts` antes de verificar consumidores.
