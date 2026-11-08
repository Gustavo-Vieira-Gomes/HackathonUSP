> Registro histórico do WIP 909a786. Para o escopo final e prova atual, consulte `spec.md` e `verification.md`. Busca web/API e IDs determinísticos deste registro foram retirados.

# HANDOFF — HACK-15 (checkpoint WIP, 08/11/2026)

**Card Linear:** HACK-15 — dados de demonstração; integra a associação do catálogo HACK-41.
**Branch:** `feat/hack-15-demo-seed` · **estado:** trabalho em andamento, NÃO concluído / NÃO aprovado para PR ou merge.
**Base de trabalho:** `cec54ea` (main no início da execução); a main remota avançou.
**Responsável:** Luiz Felipe Manzoli. **Agente anterior:** Ipê (Codex Sol low).

## Entregue no checkpoint (código ainda não validado integralmente)

- Manifesto de dez unidades clínicas referenciadas por CNES/endereço/coordenadas, com fontes e pesquisas nas especificações.
- Seed de demo no Nest/Prisma: clínicas, cerca de 100 exames, dois alvos futuros de integração de agenda, doze pacientes fictícios e inscrições de demonstração.
- Contratos Zod de clínicas, rota pública `GET /api/clinics`, página Next `/buscar`, filtros, estados de loading e testes associados.
- Integração de questionários canônicos HACK-41 no seed, sem declarar aprovação clínica.
- Plano/checklist/pesquisa em `.specs/features/hack-15-demo-seed/`; `resume.md` contém contexto detalhado.

## Último estado de validação reportado pelos agentes

- A aplicação do seed em PostgreSQL de testes indicou **10 clínicas, 100 exames e 2 alvos de agenda**; isso é evidência parcial, não aceite completo.
- Foram relatadas **10/11 provas focadas passando**; **C9** falhava porque o teste de indisponibilidade atingia a inicialização do Clock antes do endpoint. Corrigir e reexecutar.
- Testes da camada web (16/16) e build/lint/typecheck focalizados foram relatados como verdes no checkout anterior, mas **não revalidados neste checkpoint**.
- Pendentes: prova integral C1–C12 no HEAD final, `npm run check`, `npm run build`, `npm run smoke`, revisão independente, verificação de UI em 390/1280 px, gate final da skill.
- Não presumir ambiente de testes local existente na máquina de quem recebe.

## Como retomar em outra máquina

1. `git fetch origin && git switch --track origin/feat/hack-15-demo-seed` (ou `git switch feat/hack-15-demo-seed` se já existir).
2. Use Node 24 LTS; `npm ci`. Configure PostgreSQL **exclusivo de teste** e variáveis locais conforme `apps/api/.env.example`; **não reutilize os bancos ou senhas locais do autor**.
3. Leia `AGENTS.md`, as regras `.claude/rules/`, `plan.md`, `checks.md`, `resume.md`, `research-verified.md` e `tuss-verified.md`.
4. Corrija o cenário C9 sem simular sucesso nem alterar o escopo. Teste duas execuções do seed (idempotência), matching SQL real, nenhum vazamento de dados e comportamento de `/api/clinics` e `/buscar`.
5. Execute os testes aplicáveis, `npm run check`, `npm run build`, `npm run smoke` e revisão independente no HEAD final; registre evidências objetivas.
6. Só depois de atender TODOS os critérios do Linear, preparar PR **completo**, sem merge automático.

**Atenção:** os nomes e dados de clínicas são referências públicas; preços e pacientes são apenas de demonstração. Não afirmar parceria com clínicas ou revisão médica aprovada. Não realizar deploy nem manipular ambientes reais com o seed.

## Proveniência e limites

Commit deste handoff é **checkpoint de recuperação**, não prova de teste, entrega ou revisão. Nenhuma alteração de `main` foi feita por este checkpoint; não exporta sessões Codex, bancos ou segredos. A execução anterior ocorreu em `/tmp/HackathonUSP-hack15`.
