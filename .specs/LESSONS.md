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

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
