**Atualizado em 08/11/2026 — mudou:** HACK-32 iniciado.

# Handoff Motor · HACK-32

- **Fase:** planejamento.
- **Linear:** HACK-32 In Progress. HACK-29 Done (9681fb6).
- **Worktree:** .worktrees/HACK-32 (a criar pelo Planejador), branch gvieira26gomes/hack-32-34-cron-a-cada-minuto-ondas-de-alerta, base origin/main ab0c571.
- **Escopo extra (comentário do Gustavo de 08/11):** ondas serializadas por vaga; lote do expireDue que não para em erro não-409; relógio da demo (RelogioService não existe em main → PERGUNTA antes do build).
- **Consome de main:** VacanciesService, MatchingService, price-engine, NotificationsService, RealtimeService.
- **HACK-48 em main (#21 adfe8f1, #22 21c8b39):** sem_adapter → sem_canal; todo canal grava Alert; candidatos() exclui alertChannels vazio; ChannelAdapter.send com delivery. Construtor HACK-32 R2 incorpora (merge, literal, C35), antes do Verify (o briefing do Verificador não tinha sido enviado; ele foi dispensado sem trabalho).
- **R2 pronto:** HEAD a0488b0, merge add044a (21c8b39); C1–C35 verdes; check/build verdes. C35 mudou de sentido (sem_canal grava Alert pelo NotificationsService; motor só lê max(wave)) — avisado ao geral.
- **Verify VERDE 08/11:** validate_verification exit 0; 69/69 provas; check (API 247/247) e build verdes; 7 mutantes, 7 mortos; desvios 1–7 aceitos. Ressalvas não bloqueantes: (a) checks.md:161/168 apontam a porta 3 para o C7, mas a prova real é C8 + C7 extra (vacancy-motor.job.test.ts:486-508); (b) comentário velho em waves.service.ts:35-38 (chama o filtro de contorno); (c) waves.service.ts:125-129: se todos os enviar rejeitarem ou o processo cair entre commit e envio, a onda seguinte repete o rótulo k.
- **Recruits vivos:** Entregador HACK-32.
- **Plano:** .specs/features/hack-32-cron-ondas/plan.md (24 critérios, 8 fatias), PERGUNTA enviada ao geral (Q1 relógio, Q2 alerta depois do esgotamento, Q3 ordem do job). Worktree criado: base ab0c571; .env hack_32, API 3321, Next 3320.
- **Aprovação 08/11:** D1 (b) esperar RelogioService do Pedro (Assumption now()); D2 (a); ordem (a) expirar antes das ondas. Plano ajustado, validate_plan 0.
- **Bloqueio:** HACK-30 reaberto (Pedro, In Progress) para entregar RelogioService.agora() com deslocamento configurável e endpoint protegido; bloqueia o HACK-32. Build espera «relógio em main».
- **Checks:** .specs/features/hack-32-cron-ondas/checks.md, 34 checks em 8 fatias, aprovados pelo maestro em 08/11. Dependem do relógio: C22–C26 e C32. Plano usa RelogioService.agora() (validate_plan 0).
- **#17 do Pedro (aberta, 79855cc):** relógio real = ClockService (now/offsetMinutes/refresh/advance/reset, deslocamento no banco, ClockController); também mexe em pricing/matching/notificações. Construtor alinhando plan/checks.
- **Alinhado à #17 (08/11):** ClockService.now() com refresh() no handler do @Cron; preço via PricingService.recalculatePrices(now); enviar(patientId, message, context); candidatos() sem mudança; RN-36 continua no 32 (porta 4). C11, C19 e C25 ajustados à #17 com aprovação do maestro. Decisão técnica: --test-concurrency=1 na API (DemoClock é uma linha compartilhada entre arquivos de teste), em commit próprio, com teto de 2x no tempo da suíte.
- **Revisor do time confirmou as interfaces da #17**; nenhum check aprovado mudou de sentido (C19/C20: exatamente 1 vagaPreco, emitido pelo PricingService). HACK-46 (relógio global adiantável por qualquer clínica) registrado em Fora do card.
- **#17 em main (9c99e08), build liberado em 08/11.**
- **Testes em série:** 12,7 s → 33,9 s (2,66x, 172 testes); maestro aceitou a opção (a) acima do teto, por simplicidade. Banco hack_32 no container hack-29-postgres-1 (54329).
- **PR #18 mergeada (55fdd75):** assertDailyDiscountCap saiu (virou publishWithinDailyCap); o 32 não usa (só o próprio pricing do Pedro). Antes da PR: merge de origin/main + check.
- **(antes) PR #18 do Pedro (HACK-46/47):** relógio por token do operador + corrida no teto diário; se entrar antes do PR do 32, Entregador faz merge de origin/main e roda check de novo (now()/refresh() não mudam).
- **Risco #19 (b52185e) / HACK-48:** decisão técnica (a): onda só conta paciente com outcome ≠ sem_adapter e avança na lista de candidatos(); cron não grava Alert; check C35 novo.
- **Exemplo de preço corrigido:** 30 h → 64800 (não 57600) em AC 14, C19–C21; maxPrice do C21 = 70000.
- **Build pronto 08/11:** HEAD 6dce33d (diff do card b52185e..HEAD), C1–C35 verdes, check/build 0, mutações mortas (SKIP LOCKED → C7 extra/C8; sem_adapter → C35). Suíte 51,9 s (229 testes). Desvios: flag VACANCY_MOTOR_ENABLED; transition com now opcional; banco no container do 29; C7 extra; reason 'Onda <k>'.
- **Próximo marco:** Verificador → Entregador.
