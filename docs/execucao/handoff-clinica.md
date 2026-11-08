**Atualizado em 08/11/2026 03:50 — mudou:** PR aberta: https://github.com/Gustavo-Vieira-Gomes/HackathonUSP/pull/24 (HACK-16; merge de origin/main 48c63b0; check, build e smoke 0).

[17 lines total]
1 **Atualizado em 08/11/2026 02:50 — mudou:** plano do HACK-16 aprovado; Construtor 16 e Planejador 17 recrutados.
2
3 FASE: HACK-16 em checks (Construtor HACK-16). HACK-17 em planejamento (Planejador HACK-17), In Progress no Linear.
4 LINEAR: HACK-16 In Progress; HACK-17 In Progress.
5 WORKTREE 16: .worktrees/HACK-16, branch gvieira26gomes/hack-16-11-cadastro-e-login-da-clinica, base origin/main 55fdd75. Postgres 54316/hack_16, API 3161, web 3160.
6 WORKTREE 17: .worktrees/HACK-17 (a criar), branch gvieira26gomes/hack-17-12-cadastro-de-exames-com-validacoes; Postgres 54317/hack_17, API 3171, web 3170.
7 PLANO 16: .specs/features/hack-16-cadastro-login-clinica/plan.md (aprovado: Nominatim com UA genérico; cadastro num passo, 422; responsável técnico num campo).
8 PRs: nenhuma.
9 BUILD 16: commits 1deb4e5..a0a8f6a (sem push). check/build/smoke 0; API 201/201. Desvios: sign-up/clinica movido para ClinicSignUpController (evita ciclo); isUniqueViolation em prisma/prisma-errors.ts; fila do geocodificador por fim da chamada.
10 VERIFY 16: round 1 VERMELHO (C12 sem prova do 429 em /clinica); retrabalho b9a44a8, 36f0d2e; round 2 VERDE (validate 0). Geral avisado do build verificado.
11 RECRUITS VIVOS: Construtor HACK-16 (parado, mantém dev 3160/3161/3169 para o portal «HACK-16 Clínica»), Entregador HACK-16 (check/build/smoke, push, PR).
12 DECISÕES: node_modules copiado do worktree HACK-29 (lockfile igual ao origin/main; o do checkout principal está desatualizado).
13 API PARA OUTRAS FRENTES: @ClinicOnly() + @CurrentClinicId() (ClinicsModule), ZodBodyPipe, 422 {code,message,fields}.
14 REGRA DO GUSTAVO: toda tarefa de UI aberta num portal do Maestri durante o build, para ele acompanhar.
15 FORA DO CARD: —
16 PLANO 17: .worktrees/HACK-17/.specs/features/hack-17-cadastro-exames/plan.md, APROVADO com ajustes (degrau abaixo do piso aceito, motor trava; settings; PUT de edição incluído, TUSS imutável; lista TUSS mínima com fonte). 43 critérios, validate 0. Worktree 17 base cec54ea; Construtor 17 só após 16 em main (git merge origin/main antes).
17 PRÓXIMO MARCO: build e verificação do 16 (avisar geral e frente Agenda); depois merge do 16 → Construtor 17.
