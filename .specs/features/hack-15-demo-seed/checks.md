> Registro histórico do WIP 909a786. Para o escopo final e prova atual, consulte `spec.md` e `verification.md`. Busca web/API e IDs determinísticos deste registro foram retirados.

# HACK-15 checks

Build: `npm run build`; `npm run lint`; `npm run typecheck`
Run seed: `npm run build -w @hackathon/contracts && cd apps/api && npx prisma generate && npx tsc -p tsconfig.json --outDir .test-dist && node --env-file-if-exists=.env --test --test-reporter=tap .test-dist/modules/demo-data/demo-seed.test.js`
Plan: `.specs/features/hack-15-demo-seed/plan.md`

12 checks in 1 slice · 3 one-way doors · 0 open, of which 0 block

## Checks

### S1 - Demonstração reproduzível

**C1** - Duas execuções CLI mantêm dez clínicas e IDs/contagens estáveis de todas as entidades próprias (AC 1).
Proof: run seed | ok H15 C1 CLI idempotente

**C2** - Dez clínicas têm coordenadas, endereço e fontes reais verificadas (AC 2).
Proof: run seed | ok H15 C2 manifesto verificavel

**C3** - Dois alvos futuros e oito sem agenda; nenhuma credencial Google ou sessão criada (AC 3).
Proof: run seed | ok H15 C3 agenda futura

**C4** - Dez protocolos cobrem cinco modalidades; preços/pisos válidos e RM 72000/50000 (AC 4).
Proof: run seed | ok H15 C4 precos e protocolos

**C5** - Todos exames têm snapshot/chave/versão/preparo/contraindicações canônicos e revisão pending (AC 5).
Proof: run seed | ok H15 C5 associacao canonica

**C6** - Doze pacientes fictícios têm inscrições RM válidas e sete janelas completas cada (AC 6).
Proof: run seed | ok H15 C6 pacientes e inscricoes

**C7** - Matching real devolve doze candidatos distintos para RM no dia seguinte às 14h locais (AC 7).
Proof: run seed | ok H15 C7 matching real

**C8** - Busca HTTP pública lista dez clínicas, filtra nome e recusa q com 121 caracteres (AC 8).
Proof: run seed | ok H15 C8 busca HTTP

**C9** - Busca vazia retorna zero e falha do banco retorna erro real (AC 9).
Proof: run seed | ok H15 C9 vazio e falha

**C10** - Conflito, falha e concorrência não alteram registro alheio nem persistem transação parcial (AC 10).
Proof: run seed | ok H15 C10 rollback e isolamento

**C11** - CLI recusa produção e ambiente ausente; pacientes fictícios não têm login/canais externos (AC 11).
Proof: run seed | ok H15 C11 ambiente seguro

**C12** - Visitante busca por teclado, vê dez clínicas, filtro e vazio em 390/1280px sem overflow (AC 12).
Proof: walk - visitar /buscar, submeter formulário por teclado, conferir quantidade/filtro/vazio/erro e larguras 390/1280

## Coverage

| Set (size)                    | Member -> proof                                                                                                                                              | Unproven |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| GET /api/clinics statuses (3) | 200 C8 · 400 C8 · 500 C9                                                                                                                                     | -        |
| GET /buscar statuses (1)      | 200 C12                                                                                                                                                      | -        |
| Landing doors (3)             | snapshot C5 · alvo agenda C3 · identidade estável C1 C10                                                                                                     | -        |
| Entidades persistidas (8)     | User C6 · Clinic C1 · Exam C4 C5 · PriceStep C1 C4 · Patient C6 · Subscription C6 · SubscriptionWindow C6 · ClinicOpeningHours C1                            | -        |
| Protocolos (10)               | abdome superior C5 · pelve transabdominal C5 · tireoide C5 · mamas C5 · US articular C5 · eco C5 · mamografia C5 · TC crânio C5 · TC tórax C5 · RM joelho C5 | -        |
| Startup (2)                   | API createApp C8 · CLI C1 C11                                                                                                                                | -        |
| UI controls (1)               | Buscar C12                                                                                                                                                   | -        |

## Swept

- validation: C2 C4 C5 C8
- failure modes: C9 C10 C11
- idempotency: C1
- authorization: C8 público; C11 CLI local explícito
- concurrency: C10
- data lifecycle: C1 C6 C10; sem apagar histórico de demo
- dependency failure: C9
- state transitions: n/a - seed não muda estado de vaga/reserva
- observability: C1 C11 contagens e exit code, sem segredos

## Handoff

- **Settled mid-build:** aprovação delegada do Maestro registrada em plan.md; substituições factuais equivalentes autorizadas. Em 08/11/2026 Maestro aprovou por delegação a correção mecânica da linha Run seed: `npm run build -w @hackathon/contracts && npm run test -w @hackathon/api -- --test-reporter=tap` substituída por `npm run build -w @hackathon/contracts && cd apps/api && npx prisma generate && npx tsc -p tsconfig.json --outDir .test-dist && node --env-file-if-exists=.env --test --test-reporter=tap .test-dist/modules/demo-data/demo-seed.test.js`. A flag anterior estava após o glob e não selecionava reporter TAP. C1–C12 inalterados. O marcador `ok H15 Cn` deve aparecer por palavras em ordem na linha real `ok <n> - H15 Cn`, sem skip.
- **Dispatched:** pesquisa factual /root/research_clinics, Sol LOW; implementação /root/implement_seed e /root/implement_search_ui, Sol LOW, HEAD cec54ea. Verifier ainda não despachado.
- **Boundary:** nenhuma implementação iniciada; checks aguardam validação.
- **Abandoned:** Docker indisponível; Postgres exclusivo iniciado com binários locais existentes.
- **Walked:** pendente.
