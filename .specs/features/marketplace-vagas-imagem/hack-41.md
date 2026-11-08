# HACK-41 — Catálogo de preparo e triagem

## Resultado e escopo

Disponibilizar dados candidatos de preparo e perguntas fechadas para o seed HACK-15, com contrato público validado. O paciente terá instruções e confirmação por modelo de exame. Validação de mentor médico foi dispensada pelo usuário para o aceite do card, conforme registrado no Linear. Essa dispensa não representa aprovação clínica.

## Critérios observáveis

- Todos os nove modelos do catálogo têm condição, horas antes, confirmação, lista fechada de perguntas, versão, fontes e revisão pendente.
- Contrato recusa resposta livre, pergunta desconhecida, duplicatas, coação de booleanos e aprovação médica no payload do paciente; preserva `unknown` sem interpretá-lo como negativa.
- O contrato mantém metadados factuais: se uma revisão for declarada aprovada, requer identidade, registro profissional, data e evidência. Obter essa revisão não é critério de conclusão do card.
- Horas negativas/não finitas e perguntas duplicadas são recusadas ao carregar o seed.
- Integração de persistência e associação aos TUSS reais ficam no HACK-15; autorização e decisão de reserva no serviço de aceite. Não há novas rotas nesta entrega.

## Caminho e contratos

`packages/contracts/src/exam-questionnaires.ts` contém schemas serializáveis; `apps/api/src/modules/exams/exam-questionnaires.seed.ts` contém os dados, sem copiar regras para o browser. O contrato de respostas não decide elegibilidade clínica. Instruções de integração e critérios de aceite atuais: `docs/product/exam-questionnaires.md`.

## Passos executados

1. Conferir RN-02/RN-37 e referências clínicas públicas.
2. Preparar catálogo candidato e schemas, com testes de limites.
3. Documentar integração do seed e encaminhamento clínico.
4. Alinhar a documentação à dispensa de mentor registrada pelo usuário, preservando os metadados de revisão e a pendência de associação ao seed.

## Verificação e limites

Lint e tipos passaram. Dez testes passaram (seis novos), incluindo validação real do catálogo e rejeição de payloads inválidos. O check global de formatação encontrou problemas anteriores em quatro arquivos fora desta mudança; não foram reformatados para evitar alterações alheias. Formatação dos arquivos alterados verificada separadamente. Build de produção verificado ao final da implementação.

A verificação acima registra a entrega original do PR #1, já integrado. Na atualização documental, HACK-15 está In Progress com Luiz: seu seed não é assumido nem alterado aqui. HACK-41 permanece In Progress até conferir e registrar a associação/cobertura dos questionários nos exames efetivos desse seed. Validação de mentor não é mais requisito de aceite, por decisão do usuário; nenhum protocolo recebe aprovação clínica por essa dispensa.
