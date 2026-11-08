Handoff Tempo real · HACK-38

**Atualizado em 08/11/2026 00:42 — mudou:** re-verificação verde (32/32, validate_verification 0, HEAD bc3baf6); Entregador HACK-38 abrindo a PR.

- Fase: entrega (check/build, push, PR base main).
- Linear: HACK-38, In Progress.
- Worktree: .worktrees/HACK-38, branch gvieira26gomes/hack-38-45-tempo-real-por-websocket-vaga-nova, base origin/main 0779304 (12 em main, fast-forward); HEAD 1a8fbb2, 7 commits locais, sem push. No build: git merge origin/main (com o 12 já em main); PR com --base main; merge direto em main (squash) após veredito sem bloqueio, card para Done.
- Plano: .specs/features/hack-38-tempo-real-websocket/plan.md (27 AC, 4 fatias, light, validate_plan 0). Ainda não commitado: entra no primeiro commit do Construtor. checks.md: 32 checks em 5 fatias, validate_checks 0, aprovados pelo maestro.
- PRs: nenhuma.
- Recruits vivos: Entregador HACK-38. Planejador, Construtor, Construtor R2 e Verificador dispensados.
- Decisões: D1 = A (token de uso único oneTimeToken do Better Auth, emitido via Next, em auth.token; cookie aceito em dev; muda a letra do T4). D2 = A (vaga.reservada só na sala vaga:<id>). Técnicas (maestro, 08/11): o gateway usa o AuthSessionService do 12; autenticação só no middleware do namespace, sem @AllowAnonymous() (no Nest 11 os guards globais não rodam em mensagens de gateway; o Construtor provou isso por mutação); oneTimeToken já configurado no 12; src/modules/realtime; cliente web como módulo TS mais hook fino; C9/AC 10: Origin estranha dá 403 no polling e 400 no upgrade websocket (abortUpgrade fixo do engine.io 6), sem código próprio no upgrade. Sala clinica:<user.id> por uma função única até o HACK-13; tsx --test no web.
- Pressupostos do HACK-12 a conferir no merge: socket.io/@nestjs/platform-socket.io instalados; leitura de sessão reutilizável por headers; user.role na sessão; repasse /api/auth do Next ao Nest; Postgres do Compose (banco hack_38).
- Fora do card: ligar os emissores (3.2, 3.4, 2.5); ligar as telas 2.2 e 2.4; deploy e WSS (HACK-14).
- Próximo marco: veredito do Verificador → Entregador (check/build, push, PR base main) → Revisor → merge direto (squash) e Done.
