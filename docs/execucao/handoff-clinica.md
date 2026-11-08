[14 lines total]
1 **Atualizado em 08/11/2026 03:56 — mudou:** HACK-16 mergeado em main (a3b6bf4) e Done; cards HACK-50/51 criados; Construtor HACK-17 recrutado.
2
3 FASE: HACK-16 concluído. HACK-17 em checks (Construtor HACK-17).
4 LINEAR: HACK-16 Done; HACK-17 In Progress; HACK-50 (R1/R3 cadastro não atômico) e HACK-51 (R2 /clinica com API fora) em Backlog.
5 HACK-16: PR #24 squash a3b6bf40411acd037afc5532031505c46035b09d. Veredito APROVAR COM RESSALVAS (R4–R6 baixas no comentário do card). Corpo da PR corrigido (não é transação). Geral avisado.
6 WORKTREE 17: .worktrees/HACK-17, branch gvieira26gomes/hack-17-12-cadastro-de-exames-com-validacoes, base cec54ea → git merge origin/main (a3b6bf4) pedido. Postgres 54317/hack_17, API 3171, web 3170.
7 PLANO 17: .specs/features/hack-17-cadastro-exames/plan.md, APROVADO (degrau abaixo do piso aceito; settings; PUT, TUSS imutável; lista TUSS mínima com fonte; pendência go-live: conferência ANS). 43 critérios.
8 RECRUITS VIVOS: Construtor HACK-17 (parado, segura o dev do portal), Verificador HACK-17.
9 DECISÕES: node_modules do worktree HACK-29; merge aditivo de 6 arquivos no 16 autorizado ao Entregador (sem efeito de negócio).
10 REGRA DO GUSTAVO (08/11): implementações diretas e enxutas, só o que o card pede; ressalva baixa não vira retrabalho; msgs ao geral em 1–3 linhas.
11 REGRA DO GUSTAVO: toda tarefa de UI aberta num portal do Maestri durante o build.
12 FORA DO CARD: apps/web/AGENTS.md e next-env.d.ts alterados pelo next dev (não commitar); cópias de isUniqueViolation em whatsapp/phone-verification (R5).
13 BUILD 17: commits b59d08a..d701c05 (sem push). check/build/smoke 0 (API 304/304). Portal «HACK-17 Exames» aberto (web 3170, API 3171, geocoder falso 3179). C41 parcial aceito (dono HACK-51, comentado). C45 parcial (select/Espaço pelo portal). Lista TUSS: 11 códigos de fonte terceira, nenhum conferido na ANS (bloqueia go-live).
14 PRÓXIMO MARCO: Verify do 17 (Verificador HACK-17).
