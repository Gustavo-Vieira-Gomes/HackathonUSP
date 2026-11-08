# Fluxo de trabalho do time (ordem de execução)

Ordem de execução dos cards do projeto [P-HACK-1](https://linear.app/workspace-do-gustavo/project/marketplace-de-vagas-em-exames-de-imagem-f2508bbfad3c) no Linear, em ondas. Cada onda só começa quando os bloqueadores registrados nos cards estão concluídos. As ondas existem como milestones do projeto. Cópia viva no Linear: [Fluxo de trabalho do time](https://linear.app/workspace-do-gustavo/document/fluxo-de-trabalho-do-time-ordem-de-execucao-923c7f16736c).

Fonte das regras: [`marketplace-vagas-imagem.md`](marketplace-vagas-imagem.md). Histórico de decisões: `.specs/features/marketplace-vagas-imagem/brainstorm.md`.

## Donos por área

| Pessoa  | Área                                                    | Cards                             |
| ------- | ------------------------------------------------------- | --------------------------------- |
| Gustavo | Fundação, trava de pagamento, sincronizador, tempo real | 0.1, 0.2, 1.4, 2.5, 3.1, 3.4, 4.5 |
| Pedro   | Motor de regras e notificações                          | 3.2, 3.3, 3.5, 4.1, 4.2, 4.3, 4.4 |
| Mateus  | Clínica                                                 | 1.1, 1.2, 1.3, 1.5, 1.6, 6.3      |
| Luiz    | Paciente                                                | 0.4, 2.1, 2.2, 2.3, 2.4, 2.6      |
| Nicolas | Deploy, IA, demo                                        | 0.3, 1.7, 5.1, 6.1, 6.2           |

Épicos: E0 (HACK-5) e E3 (HACK-8) Gustavo · E1 (HACK-6) Mateus · E2 (HACK-7) Luiz · E4 (HACK-9) Pedro · E5 (HACK-10) e E6 (HACK-11) Nicolas.

## Ondas

```
ONDA 0 — largada (nada bloqueia)
  Gustavo  0.1 stack (HACK-12) ───────────────────┐  caminho crítico
  Nicolas  6.2 questionários por exame (HACK-41)  │
  todos    preparação sem card: contas Google     │
           Cloud, Vercel, Railway, Neon, OpenAI,  │
           número do WhatsApp, pesquisa de        │
           clínicas e códigos TUSS                │
                                                  ▼
ONDA 1 — após 0.1
  Gustavo  0.2 modelo de dados (HACK-13) ─────────┐  caminho crítico
  Nicolas  0.3 deploy com HTTPS (HACK-14)         │
                                                  ▼
ONDA 2 — após 0.2 (todo mundo destrava aqui)
  Gustavo  3.1 máquina de estados (HACK-29) ─────┐  caminho crítico
  Gustavo  4.5 WebSocket (HACK-38, precisa de 0.3)│
  Pedro    3.2 preço (30) · 3.3 matching (31) · 4.1 notificações (34)
  Mateus   1.1 cadastro da clínica (HACK-16)      │
  Luiz     2.1 cadastro do paciente (23) · 0.4 seed (15)
                                                  ▼
ONDA 3
  Gustavo  1.4 sincronizador (HACK-19; 1.3 + 3.1) ┐  gatilho da demo
  Gustavo  3.4 cron de ondas (HACK-32; 3.1+3.2+3.3+4.1)
  Pedro    4.2 push (35; 4.1 + 0.3) · 4.3 e-mail (36) · 4.4 WhatsApp (37)
  Mateus   1.2 exames (17) · 1.3 OAuth Google (18; 1.1)
  Luiz     2.2 inscrição (24; 2.1 + 3.3)          │
                                                  ▼
ONDA 4
  Mateus   1.5 publicar vaga e no-show (20; 1.2 + 3.1)
  Luiz     2.4 tela do alerta (26; 2.2 + 4.5) · 2.3 reserva comum (25; 1.4 + 2.1)
  Nicolas  5.1 leitura da foto (39; 2.2)
                                                  ▼
ONDA 5
  Gustavo  2.5 pagamento e trava (27; 2.4 + 3.1) ┐  fecha o fluxo da demo
  Pedro    3.5 no-show (33; 1.5 + 3.4)            │
                                                  ▼
ONDA 6
  Nicolas  6.1 roteiro e controle de tempo (40; 1.4 + 2.5 + 4.5)
  Mateus   1.6 realizada e taxa (21; 1.5 + 2.5)
  Luiz     2.6 confirmação e cancelamentos (28; 2.5)
                                                  ▼
ONDA 7 — se sobrar tempo
  Nicolas  1.7 painel (22; 1.6)
  Mateus   6.3 números do pitch (42; 6.1)
```

## Caminho crítico

0.1 → 0.2 → 3.1 → 1.4 e 3.4 → 2.5 → 6.1 (HACK-12, 13, 29, 19, 32, 27, 40). Seis dos sete cards são do Gustavo. Atraso em qualquer um atrasa o time.

Alívios possíveis:

- Entregar o 0.2 em duas fatias: primeira migration com Clínica, Exame, Paciente e Inscrição libera Mateus, Luiz e Pedro cedo; Vaga, Reserva, Alerta e Transição vêm na segunda.
- Passar o 3.1 (máquina de estados) para o Pedro, que fica no mesmo módulo do motor.

## O que cada um faz enquanto o 0.1 não sai

- **Pedro:** função pura de preço com testes (3.2); contrato do serviço de notificação e adapters contra interface (4.1, 4.3, 4.4); subir Evolution/WAHA em Docker e ler o QR.
- **Mateus:** projeto no Google Cloud, Calendar API e client OAuth (1.3); códigos TUSS e lista fechada em `packages/contracts` (1.2); números do pitch (6.3).
- **Luiz:** 10 clínicas reais com endereço e coordenadas (0.4); telas do paciente com dados estáticos (2.1, 2.2, 2.4).
- **Nicolas:** contas Vercel, Railway/Render e Neon (0.3); chave da API da OpenAI (5.1); questionários por exame (6.2); mentor dispensado para o aceite por decisão do usuário no HACK-41. A associação aos exames aguarda o seed HACK-15 de Luiz.

## Contratos a combinar antes de codar

- **Gustavo ↔ Pedro:** o cron (3.4) chama `candidatos(vaga)` do matching (3.3) e `enviar(destinatario, mensagem)` das notificações (4.1). Fechar as duas assinaturas primeiro.
- **Gustavo ↔ Mateus:** o sincronizador (1.4) usa o serviço de tokens do OAuth (1.3). Combinar a interface.
- **Gustavo ↔ Luiz:** a tela do alerta (2.4) assina eventos do WebSocket (4.5). Luiz constrói com dado estático e liga o socket depois.
- **Nicolas ↔ Gustavo:** o deploy (0.3) só aponta para o banco depois da primeira migration do 0.2.

## Views sugeridas no Linear

Criar em Views → New view (ou na lista do projeto, filtrar e "Save as view"):

1. **Liberado agora:** projeto = Marketplace; status ≠ Done/Canceled; não bloqueado. Agrupar por assignee, ordenar por prioridade. Mostra o que cada pessoa pode puxar neste instante.
2. **Ondas:** projeto = Marketplace. Agrupar por milestone, ordenar por prioridade. Em board, serve para projetar na sala.
3. **Caminho crítico:** HACK-12, 13, 29, 19, 32, 27, 40. Ordenar por milestone.
4. **Meu próximo card:** assignee = eu; status ≠ Done; agrupar por milestone.
