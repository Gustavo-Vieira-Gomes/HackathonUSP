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
- URLs públicas, login em celular e migration Neon ainda não verificados nesta primeira fatia de preparação.

## Retomada após HACK-13

- Integrada a `main` em `26d6e45` na branch existente do PR #4; merge sem conflitos e sem mudanças no checkout original.
- Conferidos o SQL `20261108032558_hack_13_clinica_exame_paciente_inscricao`, a preservação de `init_auth`, a verificação e a revisão do PR #5. A primeira migration de domínio está liberada. O comentário do revisor mantém a fatia 2/RN-41 pendente apesar do estado Done no Linear; nenhum desses arquivos foi alterado por HACK-14.
- O start do Render aplica as duas migrations versionadas antes de iniciar a API. Não foi aplicado SQL em banco remoto.
- Acesso externo ainda ausente: CLIs dos hosts não instalados, sem sessão local de CLI, sem variáveis de credenciais e sem integrações instaladas para Vercel/Render/Neon. Runbook atualizado com os recursos e permissões necessários, sem valores secretos.
- CI anterior do PR #4: [execução #17](https://github.com/Gustavo-Vieira-Gomes/HackathonUSP/actions/runs/42442352947) passou em Node 24 com Postgres, incluindo `db:deploy`, `check`, build e smoke completo. Uma nova execução deve validar a branch atualizada com a migration de domínio.
- Aceite final continua pendente de health/home públicos e persistência de login em celular. Manter HACK-14 In Progress e o PR existente em rascunho enquanto faltar essa evidência.

## Revisão R2 — procedência do IP

Resultado: remover o repasse de XFF arbitrário e impedir ingresso direto à autenticação do Nest com IP forjado. Next lê um IP único da borda apenas em runtime Vercel; middleware Nest autentica a credencial entre servidores antes de aceitar o header interno; Better Auth não lê mais headers públicos de IP. Boot em produção exige a credencial e o proxy recusa falta de borda/configuração em runtime. Migrations não são alteradas.

Validação prevista: headers falsos ignorados, IPv4/IPv6, falta/invalidade/listas de IP, credencial ausente/errada, boot sem configuração, health público, persistência do IP correto em sessão e 429 por IP sem evasão via XFF nem contagem única para todos os clientes. O smoke de login usa chave efêmera entre os dois servidores locais. Teste da borda real continua pendente dos hosts.
