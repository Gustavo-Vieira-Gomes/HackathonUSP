# Verificação do bootstrap

Executada localmente em 07/11/2026 com Node 24.22.2 temporário, sem alterar o Node global. Next 16.4.5 e Nest 11.2.8 resolvidos no package-lock.json.

- `npm run check`: lint das aplicações, tipos dos três pacotes, quatro testes e formatação passaram.
- `npm run build`: contratos, Nest e Next compilaram em produção.
- `npm run smoke`: iniciou builds em portas locais temporárias, validou saúde dos dois serviços, página com API conectada e página com indisponibilidade após desligar Nest. Encerrou os processos criados.
- Após ajustar testes Nest para compilação com metadados de decorators, o comando de testes da API foi repetido com Node 24: dois testes passaram. Lint da API e formatação repetidos.
- `npm audit --omit=dev`: zero vulnerabilidades reportadas nesta consulta.
- Auditoria completa: 12 alertas transitivos de desenvolvimento (2 baixos e 10 moderados), nas árvores Nest CLI e TypeScript ESLint/Next ESLint. Não foi aplicado audit fix --force. Revisitar atualizações compatíveis antes da entrega pública.
- Override localizado de multer 2.5.0 resolve o alerta alto da versão fixada transitivamente por platform-express 11.2.8. Remover quando a dependência upstream incorporar a correção; validar uploads quando esse fluxo existir.

CI configurado para Node 24, ainda não executado no GitHub. A interface foi verificada por HTTP; não houve inspeção visual automatizada. Não há banco, autenticação ou integrações de negócio para validar neste momento. Não houve deploy nem commit.

## Reorganização do frontend

Estrutura ajustada após inspeção somente de leitura do Portal Speedmilhas: app e core na raiz da aplicação, tela inicial em core/modules/initial-page/screens, consulta de saúde em core/shared/services e alias @/ para apps/web. Lint passou. Após regenerar o build para remover referências geradas ao antigo src/app, build e typecheck do frontend e smoke HTTP passaram com Node 24.22.2. Nenhum arquivo do Portal foi alterado.
