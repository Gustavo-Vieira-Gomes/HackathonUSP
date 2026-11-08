# Handoff · Frente Fundação (HACK-12 → HACK-13)

**Atualizado em 08/11/2026 — mudou:** HACK-12 verificado (38/38), indo para entrega; HACK-13 em planejamento.

## Fase

- **HACK-12** (0.1 stack): build verificado, Entregador abrindo a PR. Linear: In Progress.
- **HACK-13** (0.2 modelo de dados): Planejador trabalhando. Construção só depois do 12 em `main`. Linear: In Progress.

## HACK-12

- Worktree: `.worktrees/HACK-12`, branch `gvieira26gomes/hack-12-01-preparar-stack-prisma-postgres`, base `ad7ff67` (origin/main), HEAD verificado `1a2e804`.
- Plano: `.specs/features/hack-12-stack/plan.md` (aprovado pelo Gustavo, 34 critérios). Checks: `checks.md` (38). Verificação: `verification.md` (verde, `validate_verification` 0).
- Locais: Postgres 54312 / `hack_12`, API 3121, Next 3120.
- PR: pendente.

## Decisões

- D1 (Gustavo): cadastros separados por papel, `POST /api/sign-up/paciente` e `/api/sign-up/clinica`; `role` nunca vem do cliente; `/sign-up/email` genérico → 404; conta sem papel não é criada.
- D2 (Gustavo): um papel por conta, e-mail único.
- Técnica (maestro): pressupostos do HACK-38 entram no 12 (`AuthSessionService.getSession`/`verifyOneTimeToken`, socket.io instalado, plugin oneTimeToken). Motivo: um dono só da configuração do Better Auth.
- Técnica (maestro): 4 docs sem prettier não são formatados no card (pré-existentes na main, risco de conflito); `.maestri` no `.prettierignore`/`.gitignore`.
- Regra do Gustavo (08/11): PR aprovada pelo Revisor sem bloqueio é mergeada direto (squash) e o card vai a Done.

## Fora do card

- `format:check` vermelho em `main` por 4 docs (`brainstorm.md` ×2, `fluxo-de-trabalho.md`, `marketplace-vagas-imagem.md`). Avisado ao geral.
- `.gitignore` de `main` sem `.worktrees/`. Avisado ao geral.
- Cookie de sessão no domínio do Next: handshake socket.io em produção resolvido no HACK-38 por token de uso único (oneTimeToken).
- Observações do Verificador para a revisão: `x-forwarded-for` repassado como veio (spoofável sem borda que sobrescreva); placeholder de `BETTER_AUTH_SECRET` no `.env.example` tem 43 caracteres e passa na validação.

## Recruits vivos

- Entregador HACK-12, Planejador HACK-13.

## Próximo marco

PR do HACK-12 aberta → revisão → merge em `main` («12 em main»).
