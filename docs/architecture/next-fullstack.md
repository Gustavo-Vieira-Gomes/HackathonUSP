# Perfil Next full stack (alternativo, inativo)

## Organização ao ativar

Manter `apps/web` e `packages/contracts`. Criar `apps/web/core/server/modules/<feature>/` apenas para funcionalidades reais: casos de uso, acesso a dados e integrações. Marcar entradas de servidor com `import 'server-only'`. Componentes de servidor chamam casos de uso diretamente. Server Actions tratam mutações da interface; Route Handlers atendem HTTP público/webhooks. Ambos validam entradas e autorização; nenhum contém regra duplicada.

## Migração segura

1. Inventariar cada endpoint, consumidor, autenticação, transação e integração do Nest. Registrar critérios e testes do comportamento existente.
2. Adaptar os serviços Nest e suas dependências para o servidor Next. O código atual pode usar decorators e outros recursos nativos do Nest; portabilidade automática não é premissa. Substituir DI, decorators, pipes, guards, interceptors e filtros pelos mecanismos adequados ao Next, preservando regras, validação e autorização. Reaproveitar lógica compatível e acesso a dados quando possível. Não compartilhar instância de estado durável como substituto do banco.
3. Adaptar consumidores; manter contrato HTTP se houver consumidores externos. Migrar autenticação/autorização, configuração e tratamento de erros, não apenas o caminho feliz.
4. Rodar os mesmos testes de contrato e cenários reais. Confirmar que nenhuma rota depende do Nest nem de API_BASE_URL. Ajustar health da interface para não consultar API separada.
5. Alterar script raiz `dev` para build dos contratos seguido de dev do web; remover concurrently se sem uso. Ajustar também build e smoke, que iniciam explicitamente a API. Remover o override transitivo de multer junto à dependência Nest. Remover job/referências API no CI, env examples, README e lockfile via npm install.
6. Atualizar ACTIVE.md e instruções locais. Só então remover apps/api, conferir instalação limpa, `npm run check`, `npm run build` e smoke HTTP da versão final.

## Workers e WebSocket

Podem permanecer neste repositório sem Nest. Workers duráveis podem exigir processo separado, fila e armazenamento conforme requisito. WebSocket pode exigir servidor Node customizado ou serviço dedicado. Escolher hospedagem compatível com processos persistentes; funções com timeout não são substituto automático. Não iniciar tarefas duráveis em callbacks pós-resposta sem garantia de execução.

Este documento prepara a transição; não implementa segunda versão de negócio nem autoriza exclusão automática.
