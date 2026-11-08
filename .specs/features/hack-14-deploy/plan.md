# HACK-14 — Preparação do deploy HTTPS

Card: https://linear.app/workspace-do-gustavo/issue/HACK-14

## Resultado observável

Preparar a stack entregue em HACK-12 para Next na Vercel, Nest no Render e Postgres no Neon. Trabalhar em worktree separado e não alterar schema, migrations ou código de autenticação dos colegas.

## Fatia independente

- Blueprint Render com build de contracts antes da API, bind externo, porta do host, migration antes do start e liveness.
- Configuração Vercel no workspace web com build dos contratos antes do Next.
- Runbook de variáveis, sessão via proxy existente, migration, verificação pública e teste no celular.

## Critérios do card completo

- Primeira migration HACK-13 integrada e aplicada no Neon.
- URLs HTTPS públicas da API e web verificadas; home conecta à API.
- Login pelo domínio Next em celular persiste ao recarregar; cookie Secure e HttpOnly.
- Segredos somente nos hosts; PR com resultado das verificações e evidências públicas sem credenciais.

Esta fatia não satisfaz sozinha esses critérios. Manter In Progress até existir evidência real. Sem deploy nem alteração de banco remoto durante a preparação.

## Validação desta fatia

- `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check` e `git diff --check`: passaram.
- Schemas oficiais JSON do Render e Vercel: configurações aceitas, validadas com `jsonschema` em ferramenta temporária fora do repositório.
- Testes existentes de contracts e web: 5 + 5 passaram.
- API compilada: 9 testes selecionados passaram (`app`, `config/boot`, `config/env`, `exam-questionnaires`), incluindo smoke HTTP de saúde e 404.
- Ambiente local: Node 26.12.1; Node 24 configurado nos hosts ainda precisa de verificação no CI/host. Nenhuma dependência alterada. Instalação reportou 12 vulnerabilidades transitivas (2 low, 10 moderate), não corrigidas por atualização fora do escopo.
- Suite completa da API e `npm run smoke` com cadastro/login não executados nesta fatia: requerem Postgres; o usuário local não tem acesso ao socket Docker. Não foi solicitado acesso ao banco remoto nem aplicada migration.
- URLs públicas, login em celular e migration Neon ainda não verificados. HACK-13 permanecia In Progress na última consulta.
