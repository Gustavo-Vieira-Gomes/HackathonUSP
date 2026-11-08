# Brainstorm — Marketplace de vagas em exames de imagem

Data: 07/11/2026 · Status: fechado (v5) · Hackathon Capim (tema: acesso à saúde)

Fontes cruzadas: doc "Hackathon Capim – Roteamento de Encaminhamentos" (Gustavo) e doc "Case: marketplace de vagas canceladas em exames de imagem" (Mateus). Onde contradiziam, as decisões abaixo dizem qual venceu.

## Mapa final

```
FLUXO: Marketplace de vagas em exames de imagem                  (v5)
Veredito: fazer — decidido pelo time (07/11)
Deu certo se: na demo, uma vaga publicada pela unidade vira
              reserva paga por um paciente em menos de 3 minutos,
              e a banca vê o preço de outra vaga caindo

CLÍNICA (web, desktop)
U1. Cadastro: exames (TUSS), preço cheio, piso, antecedência
    mínima, preparo, tolerância X e deslocamento Y por exame
U1b. Conecta a Google Agenda (OAuth). Reservas da plataforma
    criam eventos com título padronizado; a plataforma lê a
    agenda a cada minuto. Horários livres = oferta da reserva
    comum; evento apagado/movido = vaga de encaixe
U2. Vaga de encaixe nasce de 3 origens:
    a) cancelamento na agenda (automático)
    b) no-show: paciente não chegou em X min → vaga imediata,
       só para quem está em sobreaviso hoje, dentro da janela
       de disponibilidade e a até Y min de deslocamento
    c) horário vazio da agenda
    ├─ Google fora/token expirado → avisa a clínica, para de
    │  sincronizar; nada vira sucesso falso
    └─ ✓ segue

PACIENTE (web mobile first, PWA)
P0. Cadastro e login; reserva comum em data futura, preço cheio,
    pagamento Pix, cartão ou no local
P1. Inscrição na lista de encaixe: exame (foto do pedido como
    atalho opcional, IA preenche), região, preço máximo, JANELAS
    DE DATA/HORA em que pode ir, "posso ir hoje" com localização,
    consentimento LGPD
    ├─ já existe vaga compatível → vai direto para P4
    └─ não existe → sobreaviso; tela mostra quantas clínicas
       oferecem o exame e o botão da reserva comum; expira em
       30 dias, renovável
P2. Motor cruza vaga × inscrições: mesmo exame, região, preço
    atual ≤ máximo, horário dentro da janela, antecedência ≥ preparo
P3. Alerta (push web + e-mail reais; WhatsApp simulado) em ondas,
    ordem de inscrição; no-show: ordem por tempo de chegada
    ├─ ninguém aceita em Z min → próxima onda / vaga expira
    └─ aceitou no-show e não chegou em Y → sinal retido, vaga
       volta à fila se ainda couber
P4. Preço atual, preparo, questionário de contraindicação em
    lista fechada (sem IA)
    ├─ ✗ bloqueio (marca-passo, gravidez) → não reserva
    └─ ✓ segue
P5. Sinal obrigatório (Pix ou cartão, simulado na demo) → vaga
    travada em transação; segundo pagante vê "vaga preenchida"
P6. Confirmação: endereço, documentos, regra do sinal
P7. Comparecimento; clínica confere o pedido; taxa fixa cobrada
    da clínica

MOTOR (tarefa a cada minuto)
M1. Preço cai em degraus até o piso; nunca sobe
    (padrão: -10% a 48 h, -20% a 24 h, -30% a 6 h; clínica edita)
M2. Solta a próxima onda quando a anterior expira
M3. Libera reserva com pagamento vencido; vaga expira no horário
M4. Log por vaga: publicada, alertada, reservada, expirada

⚠ Bordas
  B2 [P4] triagem/contraindicação → tratar: lista fechada por
     exame, sem interpretação de texto livre
  B5 [P0+P1] reserva comum e encaixe do mesmo exame → tratar:
     uma cancela a outra
  B6 [P0 vs P5] canibalização do preço cheio → aceitar: desconto
     só nas últimas 24–48 h, poucas vagas/dia
  B7 [U2b] Y maior que o intervalo livre seguinte → tratar:
     no-show só publicado se Y ≤ intervalo
  B8 [U2b] preparo impossível em Y min → tratar: no-show só para
     exame sem preparo ou quem declara "já preparado"
  B9 [P0/P5] cancelamento pelo paciente → tratar: comum grátis
     até 24 h antes; encaixe sem devolução, salvo clínica cancelar
  B10 [U1b] eventos criados à mão fora do padrão → aceitar: ignorados
  B11 [todos] autorização → tratar: clínica vê só o próprio;
     paciente vê só o próprio
  B12 [art. 58 CEM] taxa por paciente encaminhado → ACEITAR com
     validação junto aos mentores (ver D3)

? Premissas
  P2 demo: 2 clínicas com Google Agenda real (contas do time) +
     8 clínicas pré-carregadas sem agenda
  P4 núcleo (regras, motor, agente) independente do canal
  P5 pagamento, Pix e WhatsApp simulados na demo
  P6 demo com os dois lados; clínica com configuração e publicar
     vaga; painel de receita só se sobrar tempo
```

## Decisões

| ID  | Decisão                                                                                                  | Porquê                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| D1  | Nicho: exames de imagem                                                                                  | Pedido padronizado (TUSS), preço comparável, resultado em um passo                         |
| D2  | Web mobile first para paciente e clínica; WhatsApp segundo canal se sobrar tempo                         | Distribuição por link, um código só; web push cobre a demo                                 |
| D3  | Receita: taxa fixa por agendamento, cobrada da clínica no comparecimento                                 | Decisão do time, reafirmada após alerta do art. 58 do CEM (doc Mateus propunha assinatura) |
| D4  | Núcleo: marketplace de vagas (oferta primeiro), modelo Mateus                                            | Vaga publicada → alerta → reserva                                                          |
| D5  | Sem opções gratuitas nem fila do SUS no fluxo                                                            | Modelo Mateus; democratização por preço e tempo                                            |
| D6  | Exames: USG, ecocardiograma, mamografia, TC e RM sem contraste; raio-X e contraste fora                  | Raio-X sem agendamento quase não gera vaga; contraste exige triagem                        |
| D7  | Dinheiro: pagamento pelo app com taxa descontada, ou no local com cobrança posterior; parcelamento Capim | Doc Capim                                                                                  |
| D8  | Web mobile first (PWA) em vez de RN + Expo                                                               | Sem build nativo na última noite; push web no Android e iOS instalado                      |
| D9  | Agenda = Google Agenda                                                                                   | Reservas criam eventos padronizados; leitura a cada minuto                                 |
| D10 | No-show com tolerância X, deslocamento Y, onda Z                                                         | Padrões X=15, Y=45, Z=10 min — **delegados**, clínica edita                                |
| D11 | Sinal obrigatório em encaixe e no-show; pagamento no local só na reserva comum                           | Financia a retenção por falta                                                              |
| D12 | Cadastro com login                                                                                       | Paciente precisa voltar à reserva; substitui "sem login"                                   |
| D13 | Janelas de disponibilidade governam todo alerta                                                          | Ninguém é notificado fora do horário em que pode ir                                        |
| D14 | Foto do pedido como atalho opcional no P1                                                                | Evita o abandono na escolha do exame; sobrevivente do doc Capim                            |
| D15 | Canais na demo: push web + e-mail reais; WhatsApp simulado                                               | Custo zero; API oficial exige aprovação                                                    |
| —   | Degraus de preço, retenção 30 dias, log por vaga, trava transacional                                     | Lote de engenharia adotado sem objeção                                                     |

## Bordas por classificação

- **Tratar:** B2, B5, B7, B8, B9, B11.
- **Aceitar:** B6 (canibalização, com controles), B10 (eventos fora do padrão), B12 (art. 58, validar com mentores).
- **Bloqueia go-live, não a demo:** questionário de preparo e contraindicação por exame escrito pelo time e conferido por mentor médico.

## Premissas sem confirmação

P2, P4, P5, P6 acima. Mais: tamanho do time, prazo exato e critérios da banca nunca foram informados.

## Encaminhado para protótipo

- Tela do paciente no momento do alerta (preço caindo, aceitar, preparo): só construindo se descobre o ritmo certo.
- Roteiro de demo de 3 min (base: doc Mateus, seção "MVP para a hackathon").

## O que mudou o desenho

1. O produto deixou de ser "foto do encaminhamento → três opções" e virou marketplace de vagas; a foto sobreviveu só como atalho.
2. No-show virou vaga **imediata** com raio de deslocamento, o que criou o estado "posso ir hoje" e a ordenação por tempo de chegada.
3. Janelas de disponibilidade passaram a ser regra de notificação, não só filtro de busca.
4. Receita por paciente foi mantida contra a evidência regulatória do doc Mateus; é o risco de negócio mais sensível e está marcado para os mentores.

## Pitch

- Métricas: taxa de preenchimento e economia média por paciente.
- Pergunta provável "e quem não pode pagar?": resposta é a linha de prefeituras comprando vagas ociosas (roadmap).

## Próximo passo

Escrever a spec BDD (`docs/templates/feature.md`) a partir deste mapa, começando pelo fluxo da demo: U2a → P3 → P5.
