# Padrões de engenharia

- Organizar por funcionalidade quando houver domínio; não criar camadas vazias. Separar transporte, casos de uso e infraestrutura conforme a necessidade real.
- Usar os recursos nativos do framework: no Nest, módulos, serviços com @Injectable(), injeção por construtor, controllers, pipes, guards, interceptors e filtros conforme a necessidade. Serviços podem depender do Nest e acessar o ORM diretamente. Manter controllers focados em HTTP e regras nos serviços; não criar interfaces, repositórios ou camadas só para uma possível migração. Reutilizar bibliotecas e integrações prontas quando resolverem uma necessidade concreta, sem recriar funcionalidades do framework.
- Contratos compartilhados definem payloads, não entidades ORM. Não expor registro completo de banco por conveniência.
- Erros esperados têm resposta explícita e status correto. Erros inesperados são registrados sem segredos; mensagem pública não expõe stack. Fallback visual deve deixar indisponibilidade clara.
- Chamadas externas têm timeout e tratamento de falha. Retentativas apenas para operação segura/idempotente e com limite. Escritas financeiras e webhooks exigem estratégia de idempotência quando existirem.
- Frontend: Server Components por padrão; usar cliente só para interatividade/APIs do navegador. Mostrar carregamento, vazio, erro e sucesso; HTML semântico, labels e navegação por teclado.
- Não adicionar caches sem definir validade, invalidação e isolamento por usuário. Não guardar estado durável na memória do processo.
- Testar invariantes e falhas: autorização, validação, persistência e integração. Mock não prova comportamento do fornecedor; registrar o limite.
- Antes de entregar: lint, tipos, testes relevantes, formatação e build. Smoke HTTP para rotas alteradas. Não criar teste que apenas repete implementação ou snapshots sem valor.
- Dependências: justificar ganho, manter lockfile e verificar compatibilidade. Não atualizar major por hábito.
