# HACK-15 — dados de demo

Escopo médio: Specify e Execute; desenho e tarefas ficam aqui porque são três passos evidentes.

## P1 — preparar uma demo reproduzível

- H15-01: WHEN executar `npm run seed`, THEN SHALL persistir dez clínicas reais de São Paulo com endereço/coordenadas do manifesto pesquisado; duas marcadas como alvo de conexão, oito não. Nenhum OAuth fictício.
- H15-02: WHEN cadastrar os exames de demonstração, THEN SHALL usar somente `allowedExams` do HACK-17 e os questionários HACK-41, preços cheios/pisos plausíveis e RM de joelho 72000/50000 centavos.
- H15-03: WHEN consultar candidatos de uma vaga de RM de joelho, THEN SHALL haver doze pacientes sintéticos com consentimento sintético, canais e inscrições compatíveis (RN-34).
- H15-04: WHEN executar novamente, THEN SHALL manter identidades, contagens e relacionamentos, com IDs gerados pelo Prisma; falha de identidade SHALL desfazer a transação.

## Execute — passos atômicos

1. Integrar main preservando os módulos vigentes; descartar tela/API de busca do WIP, fora do card.
2. Atualizar seed e teste real de idempotência/matching para schema e catálogo atuais.
3. Aplicar migration no banco local hack_15; rodar seed duas vezes, check/build/smoke; registrar prova e publicar PR para main.

## Premissas e arquivos

São Paulo é a cidade escolhida no handoff. Dados públicos das clínicas preservam as fontes do manifesto; preços, expediente e pacientes são simulação, não oferta comercial. Questionários permanecem sem aprovação clínica. Alterações: módulo demo-data, schema/migration mínima para marker e default de User.id no Prisma, scripts npm, README e artefatos desta feature/STATE. Sem nova rota ou dependência.

## Validação

Banco Postgres exclusivo; teste de integração verifica IDs/contagens após duas execuções, catálogo/questionários, preços, consentimento/canais e matching real. Gates: npm run check, npm run build e npm run smoke. Não há UAT visual porque não existe alteração de UI.
