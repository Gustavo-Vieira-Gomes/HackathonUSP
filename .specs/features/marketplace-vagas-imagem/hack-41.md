# HACK-41 — Catálogo de preparo e triagem

## Resultado e escopo

Disponibilizar dados candidatos de preparo e perguntas fechadas para o seed HACK-15, com contrato público validado. O paciente terá instruções e confirmação por modelo de exame. A aprovação médica exige revisão humana; esta implementação não a substitui.

## Critérios observáveis

- Todos os nove modelos do catálogo têm condição, horas antes, confirmação, lista fechada de perguntas, versão, fontes e revisão pendente.
- Contrato recusa resposta livre, pergunta desconhecida, duplicatas, coação de booleanos e aprovação médica no payload do paciente; preserva `unknown` sem interpretá-lo como negativa.
- Revisão aprovada requer identidade, registro profissional, data e evidência.
- Horas negativas/não finitas e perguntas duplicadas são recusadas ao carregar o seed.
- Integração de persistência e associação aos TUSS reais ficam no HACK-15; autorização e decisão de reserva no serviço de aceite. Não há novas rotas nesta entrega.

## Caminho e contratos

`packages/contracts/src/exam-questionnaires.ts` contém schemas serializáveis; `apps/api/src/modules/exams/exam-questionnaires.seed.ts` contém os dados, sem copiar regras para o browser. O contrato de respostas não decide elegibilidade clínica. Instruções de integração e registro para o mentor: `docs/product/exam-questionnaires.md`.

## Passos executados

1. Conferir RN-02/RN-37 e referências clínicas públicas.
2. Preparar catálogo candidato e schemas, com testes de limites.
3. Documentar integração do seed, encaminhamento clínico e revisão humana pendente.

## Verificação e limites

Lint e tipos passaram. Dez testes passaram (seis novos), incluindo validação real do catálogo e rejeição de payloads inválidos. O check global de formatação encontrou problemas anteriores em quatro arquivos fora desta mudança; não foram reformatados para evitar alterações alheias. Formatação dos arquivos alterados verificada separadamente. Build de produção verificado ao final da implementação.

Ainda não existe seed de banco nem fluxo de reserva no scaffold. Não foi feita validação com mentor e nenhum protocolo está aprovado para produção. O critério completo do card permanece pendente dessa validação e da conferência de cobertura dos exames efetivos do HACK-15.
