**Atualizado em 08/11/2026 — mudou:** Verify VERDE; Entregador abrindo a PR.

# Handoff Motor · HACK-29

- **Fase:** entrega (PR) → revisão → merge direto.
- **Linear:** HACK-29 In Progress. HACK-32 foi recebido e cancelado pelo geral no mesmo dia (worktree e branch removidos, card de volta a Todo).
- **Worktree:** .worktrees/HACK-29, branch gvieira26gomes/hack-29-31-maquina-de-estados-da-vaga-e-log, base main b1bc276, HEAD do build 5016ac2. Postgres 54329/hack_29, API 3291, Next 3290 (.env fora do git).
- **Plano:** .specs/features/hack-29-maquina-estados/plan.md — aprovado pelo Gustavo em 08/11 (D2–D5 = a). Fonte das entidades: fatia 2 do HACK-13 (PR #8, b0680a2).
- **Checks:** .specs/features/hack-29-maquina-estados/checks.md (C1–C23), aprovados pelo maestro. Política de teste: não gravar nas guidelines.
- **Build:** 3 commits (f6b88bc, a7abaa2, 5016ac2); sem schema nem migration. Desvios aceitos: 400 para motivo inválido; npm ci com lock (lockfile intacto); prettier em plan/checks; era própria (1981–85) nos testes de expireDue; troca manual de $transaction em C13/C15.
- **Verify:** VERDE, validate_verification exit 0, C1–C23 23/23, 5 mutações mortas, suíte da API 107/107 duas vezes.
- **Ressalvas não bloqueantes:** (a) vacancies.service.test.ts:243/253 assert.rejects do C7 sem status; (b) vacancies.service.ts:181/187 trim do reason sem prova; (c) vacancies.service.test.ts:632 C22 sincroniza por sleep(300); (d) vacancies.service.ts:92 expireDue relança erro não-409 e para o lote → HACK-32.
- **Decisões:** D1 só a vaga (maestro); D2 reserva de encaixe cancelada volta a publicada se couber, senão cancelada; D3 RN-33 reservada→alertando direto; D4 no-show → vaga velha cancelada, origem clinica; D5 publicada/alertando→cancelada permitido; D6 occurredAt estritamente crescente no serviço (maestro).
- **Fora do card:** máquina da Reservation no HACK-27 com o mesmo molde; reserva aguardando_pagamento quando a vaga expira (HACK-27/32); RN-16; atualizar o texto da RN-24 na spec para apontar a tabela.
- **Continuação da Fundação:** migration nova (FK composta Reservation↔horário, Slot↔Exam, uniques, Alert.updatedAt) — fixtures do 29 já respeitam; merge de origin/main antes do PR.
- **Recruits vivos:** Entregador HACK-29.
- **Próximo marco:** PR aberta → Revisor → merge squash em main → Done.
