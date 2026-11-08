# Brainstorm — Prontuário pessoal com acompanhamento e agente

> **Substituído em 07/11/2026.** A ideia pivotou; o escopo vigente está em `.specs/features/marketplace-vagas-imagem/brainstorm.md`.

Data: 07/11/2026 · Status: em andamento (handoff parcial) · Versão do mapa: v2

## Contexto

- Hackathon USP. Decisão de **fazer** já tomada pelo time; a conversa é sobre a **forma** (escopo).
- Tecnologia e estrutura do repositório estão **fora da mesa** por ora: o monorepo Next + Nest atual pode mudar.
- Repositório hoje é só scaffold: sem banco, login, funcionalidade de negócio.

## Ideia

Aplicação em que o usuário:

1. mantém o histórico médico completo (upload de exames, laudos, encaminhamentos, receitas);
2. acompanha os próximos passos (próximos exames, consultas, retornos);
3. conversa com um agente que tem o histórico dele como contexto para orientar e tirar dúvidas.

## Mapa

```
FLUXO: Prontuário pessoal com acompanhamento e agente            (v2)
Veredito: fazer — decidido pelo time (07/11)
Deu certo se: um usuário sobe 3 documentos e, sem digitar nada,
              vê a linha do tempo, a lista de próximos passos e
              recebe resposta correta do agente sobre o próprio caso

1. Usuário cria conta e entra
2. Usuário sobe um documento (PDF ou foto): exame, laudo,
   encaminhamento, receita
3. Sistema lê o documento e extrai dados estruturados
   (tipo, data, médico, resultados, pedidos de exame/retorno)
   ├─ ✗ ilegível → 3a. entra no histórico como "documento sem
   │   leitura", com data informada pelo usuário            ← novo
   └─ ✓ segue
4. Sistema mostra o que extraiu campo a campo, com confiança;
   usuário confirma ou corrige                                ← mudou
5. Sistema gera próximos passos como SUGESTÕES PENDENTES;
   cada uma vira pendência só com aceite do usuário           ← mudou
6. Usuário vê a linha do tempo e a lista de pendências com prazos
7. Usuário marca um passo como feito (ou sobe o documento que o
   comprova, e o sistema fecha o passo sozinho)
8. Usuário pergunta ao agente e recebe resposta ancorada nos
   documentos dele, citando a fonte; decisão clínica é
   direcionada ao médico                                      ← mudou

⚠ Bordas
  B1 [3–5] extração erra ou não lê → tratar: extração campo a
     campo com confiança; próximos passos nascem como sugestão;
     ilegível vira 3a
  B2 [8] agente responde o que não deve → tratar: só documentos
     do usuário + conhecimento explicativo; sem documento diz que
     não tem a informação; decisão clínica → médico; cita fonte
  B3 [todos] quem mais acessa o histórico → ABERTA (usuário
     responde). Padrão proposto: cada conta vê só o próprio dado;
     link somente leitura com expiração (24 h) para mostrar ao
     médico; conta de cuidador fora de escopo nesta versão
  B4 [6–7] passo vencido, recorrente, lembrete → ABERTA (usuário
     responde). Padrão proposto: vencidos no topo com "feito",
     "remarcar", "não se aplica"; recorrência cria só a próxima
     ocorrência ao concluir; lembrete push/e-mail fora da demo;
     agente avisa pendências vencidas ao abrir o chat

? Premissas
  P1 público: paciente com acompanhamento longo (crônico,
     gestante, pós-cirúrgico) — recomendação, não confirmada
  P2 contexto: hackathon com demo curta; um fluxo inteiro vale
     mais que três módulos pela metade — não confirmada
  P3 o agente não diagnostica nem prescreve; explica, organiza e
     orienta a procurar o médico — virou regra em B2
```

## Decisões tomadas

- **D1** Próximos passos são **extraídos pelo sistema** a partir dos documentos, com confirmação do usuário (opção A). Porquê: o valor da ideia é "a pessoa não precisa saber o que fazer; o app sabe". A alternativa (cadastro manual) reduzia o produto a um to-do com upload.
- **D2** (B1) Nenhuma pendência nasce sem clique do usuário; extração é exibida campo a campo com confiança; documento ilegível entra no histórico mesmo assim.
- **D3** (B2) Agente restrito ao histórico do usuário e a conhecimento explicativo; cita o documento usado; sem documento, declara que não tem a informação; decisão clínica é direcionada ao médico.

## Bordas

**Tratar:** B1, B2.

**Abertas (usuário responde, tipo `aberta`: segue com o padrão proposto até a resposta):**
- B3 — compartilhamento e cuidador. Pergunta-chave: o cuidador (filha gerenciando a mãe) é o público principal? Se sim, inverte o modelo de conta.
- B4 — passos vencidos, recorrência e lembretes.

**Fora de escopo (proposto, pendente de B3/B4):** conta de cuidador; lembrete por push/e-mail.

## Premissas sem confirmação

- P1 público-alvo; P2 formato do hackathon (prazo, tamanho do time, critérios da banca, tema imposto). Perguntadas no início; sem resposta ainda.

## O que ainda não foi varrido

- Estados da jornada: conta nova sem documento (vazio), primeira vez, upload pela metade, sai e volta amanhã, erra e quer corrigir documento já confirmado.
- Dimensões de engenharia (todas, pois não há código): validação de upload (tipo, tamanho, duplicado), falha entre gravar documento e extrair, idempotência do upload, autorização por usuário, ciclo de vida do dado (exclusão de conta, retenção de dado de saúde, LGPD), falha do provedor de IA (fora, lento, resposta fora do formato), transições de estado dos passos, observabilidade.
- Lentes de ideia: pré-mortem, custo de voltar atrás, dependências (provedor de OCR/LLM), medida de sucesso em número, uso atípico (usuário sobe 200 páginas de prontuário hospitalar).

## O que mudou o desenho até aqui

1. O passo de **confirmação pelo usuário** (4) passou a ser obrigatório: a IA sugere, a pessoa decide.
2. O agente ganhou limite explícito e **citação de fonte**, o que vira requisito de produto, não só de prompt.
3. Documento ilegível **não é rejeitado**: o histórico tem que ser completo mesmo quando a leitura falha.

## Próximo passo

Responder B3 (cuidador é o público principal?) e B4, e então varrer os estados da jornada e as dimensões de engenharia listadas acima antes de escrever a spec BDD.
