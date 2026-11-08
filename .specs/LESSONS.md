# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Plan/Checks)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Quando o check nomeia um status HTTP que o cliente traduz (401 → erro tipado), a prova roda a função de tradução real contra uma resposta HTTP, não um fetchToken injetado que já lança o erro.

- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `apps/web` · harmful: 0
- features: hack-38-tempo-real-websocket
- evidence: apps/web/core/shared/services/realtime-client.ts:48 (C27) (apps/web)
- last seen: 2026-11-08T03:37:47Z

### L-002 - Check de recusa por entrada inválida fixa o tipo e o status da exceção, e o assert.rejects confere os dois; rejeição genérica não prova o contrato de erro.

- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `apps/api` · harmful: 0
- features: hack-29-maquina-estados
- evidence: apps/api/src/modules/vacancies/vacancies.service.test.ts:243 (apps/api)
- last seen: 2026-11-08T04:35:55Z

### L-003 - Teste de corrida sincroniza por sinal explícito (promessa liberada pelo ponto de leitura), não por sleep; com sleep o caminho do 409 pode não rodar e o teste passa vazio.

- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `apps/api` · harmful: 0
- features: hack-29-maquina-estados
- evidence: apps/api/src/modules/vacancies/vacancies.service.test.ts:632 (apps/api)
- last seen: 2026-11-08T04:35:55Z

### L-004 - Rota movida para outro controller herda o check de proteção só se a prova exercita a rota nova: estender o teste de 429 para a rota movida, não só conferir os decorators.

- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `apps/api guards` · harmful: 0
- features: hack-16-cadastro-login-clinica
- evidence: apps/api/src/modules/clinics/clinic-sign-up.controller.ts:35 F1 (apps/api guards)
- last seen: 2026-11-08T06:25:57Z

### L-005 - Check que cita 'o código do fornecedor' deve nomear o valor literal, ou o teste só afirma o status.

- signal: `spec_precision_gap` · recurrence: 1 feature(s) · harmful: 0
- features: hack-16-cadastro-login-clinica
- evidence: clinic-sign-up.test.ts:270 C9
- last seen: 2026-11-08T06:25:57Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
