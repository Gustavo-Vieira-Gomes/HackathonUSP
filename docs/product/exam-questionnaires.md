# HACK-41 — Preparo e triagem por exame

Implementação candidata. Por decisão explícita do usuário registrada no [HACK-41](https://linear.app/workspace-do-gustavo/issue/HACK-41), **validação de mentor médico não é requisito de aceite do card**. A dispensa não equivale a aprovação clínica nem libera protocolos para pacientes reais. Critérios: RN-02 e RN-37 da spec. A conclusão continua pendente da associação e conferência de cobertura dos exames efetivos do seed HACK-15.

## Entrega e uso pelo HACK-15

- Contratos públicos: `packages/contracts/src/exam-questionnaires.ts`, exportados por `@hackathon/contracts`.
- Catálogo: `apps/api/src/modules/exams/exam-questionnaires.seed.ts`, export `examQuestionnairesSeed`. Não executa escrita no banco. Importar no futuro seed de persistência; usar `key` estável para upsert, sem duplicar o conteúdo.
- Associar cada exame real a um modelo com região, via e protocolo compatíveis. As chaves internas **não são TUSS**. Validar códigos oficiais no cadastro do HACK-15; não inferir correspondência pelo nome nem aplicar um modelo a uma região não revisada.
- Persistir versão, condição, horas antes, confirmação, perguntas, fontes e revisão; manter o vínculo exame/questionário. O catálogo não grava no banco. A integração de persistência pertence ao HACK-15, em andamento com Luiz; a associação aos exames permanece pendente até a entrega desse seed.

| Modelo                                    | Preparo candidato                                       | Antecedência |
| ----------------------------------------- | ------------------------------------------------------- | ------------ |
| USG abdome superior adulto                | Jejum; líquidos e medicamentos conforme clínica         | 8 h          |
| USG pélvica transabdominal                | Bexiga cheia conforme clínica                           | 1 h          |
| USG tireoide, mamas, musculoesquelética   | Região acessível                                        | 0 h          |
| Ecocardiograma transtorácico em repouso   | Sem jejum neste modelo                                  | 0 h          |
| Mamografia                                | Sem desodorante, talco ou creme nas axilas/mamas no dia | 0 h          |
| TC crânio/tórax sem contraste nem sedação | Sem jejum de rotina neste modelo; confirmar protocolo   | 0 h          |
| RM joelho sem contraste nem sedação       | Retirar objetos conforme equipe; informar dispositivos  | 0 h          |

`hoursBefore = 0` não elimina instruções nem confirmação de preparo. A antecedência mínima comercial do exame é outro campo (RN-02). O jejum de 8 h e a janela de 1 h são parâmetros candidatos de protocolos de referência, sujeitos ao protocolo da clínica. Não definir quantidade universal de água nem suspender medicação. Abdome total, via transvaginal, pediatria, sedação, contraste, eco de estresse e transesofágico exigem protocolos próprios e não herdam estes modelos.

## Consumo no aceite (HACK-27)

O contrato de respostas só valida formato, não decide elegibilidade. O futuro serviço de reserva no Nest deverá:

1. Carregar o questionário do exame no servidor; recusar chave/versão divergentes e perguntas faltantes, extras ou duplicadas. Nunca confiar em um catálogo ou aprovação enviados pelo navegador.
2. Exigir resposta para todas as perguntas e confirmação explícita do preparo. `yes` ou `unknown` em qualquer item interrompe a reserva automática e orienta contato com a clínica. Preparo não confirmado também impede a reserva. Não há interpretação de texto livre nem aprovação por IA.
3. Fora da demo, exigir revisão clínica aprovada e protocolo validado da clínica. `clinicalReview` é metadado do catálogo e não pertence ao payload do paciente. Preencher metadados não substitui autorização do profissional nem conferência da evidência.
4. Não registrar respostas clínicas em logs. A finalidade e persistência dessas respostas devem ser tratadas no fluxo da reserva.

O nome `contraindications` acompanha a spec, mas os itens são sinais de **encaminhamento para avaliação**, não diagnósticos nem contraindicações absolutas. Dispositivos compatíveis com RM podem ser examinados sob condições específicas; claustrofobia exige adaptação; gravidez requer avaliação do procedimento. Listas vazias em USG e eco não significam ausência universal de riscos, apenas nenhum item bloqueante definido neste modelo candidato.

Essas decisões de reserva e o bloqueio de produção estão especificados para integração futura; não há endpoint de reserva implementado nesta entrega.

## Fontes consultadas

- [UConn Health — ultrassom](https://www.uconnhealth.org/imaging-radiology/services-specialties/ultrasound): protocolos de jejum de 8 h e preparo vesical de 1 h; precisam de adaptação local.
- [ACR/RSNA — pelve](https://www.radiologyinfo.org/en/info/pelvus), [tireoide](https://www.radiologyinfo.org/info/us-thyroid), [mamas](https://www.radiologyinfo.org/info/breastus) e [musculoesquelético](https://www.radiologyinfo.org/en/info/musculous): distinguir via e região.
- [NHS — ecocardiograma](https://www.nhs.uk/tests-and-treatments/echocardiogram/): distinguir transtorácico em repouso de transesofágico e estresse.
- [ACR/RSNA — mamografia](https://www.radiologyinfo.org/en/info/mammo): produtos tópicos no dia e informação de possível gravidez.
- [ACR/RSNA — preparo para TC](https://www.radiologyinfo.org/en/info/how-to-prepare-your-ct-exam): preparo depende do protocolo e do uso de contraste.
- [ACR/RSNA — segurança em RM](https://www.radiologyinfo.org/en/info/mr) e [FDA — triagem antes da RM](https://www.fda.gov/radiation-emitting-products/mri-magnetic-resonance-imaging/what-patients-should-know-having-mri-exam): dispositivos, metais e claustrofobia exigem triagem específica.

## Aceite atual e pendência de integração

A decisão do usuário dispensa a conferência de mentor como condição de conclusão do HACK-41. Não foi obtida aprovação médica: os metadados `clinicalReview` permanecem factuais, sem preencher revisor, registro ou evidência inexistentes.

HACK-15 está **In Progress com Luiz**. Esta atualização documental não assume nem modifica o seed em andamento dele. Após a entrega:

- Conferir todos os exames/TUSS efetivos e a compatibilidade de região, via e protocolo com cada modelo associado.
- Verificar que cada exame tem preparo e perguntas de triagem preenchidos, com chave e versão válidas; identificar modelos faltantes.
- Registrar a evidência da associação e cobertura no HACK-41. Manter o card **In Progress** enquanto essa pendência existir.

Revisões clínicas futuras podem ser registradas com evidência real e versão correspondente. Elas não são um requisito de mentor para o aceite deste card; as condições de uso clínico descritas acima continuam distintas da conclusão da entrega técnica.
