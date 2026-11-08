# Validação HACK-19

08/11/2026. Base integrada: main `f59b350` (HACK-23). Node 26.3.0, Postgres local `hack_19`, porta 54319; cliente Google e envio de e-mail falsos nos testes. Sem dependências ou migrations novas.

## Portões

- `npm run check`: verde; 429 testes (364 API, 46 web, 19 contracts), zero falhas e zero ignorados; lint, tipos e Prettier verdes.
- `npm run build`: verde para contracts, Nest e Next.
- `npm run smoke`: verde; HTTP real Next/Nest, autenticação, clínica, exames, socket, demo protegida e falha da API.
- Teste isolado H18-C46: verde, preservando o consumidor isolado do módulo Google.
- Testes novos: 13 cenários do sincronizador e 2 do VacanciesService. Os dois testes de regressão falham contra a implementação base e passam com a alteração; os testes do job foram escritos antes da implementação (RED por módulo ausente).

## Cobertura

| Critério | Prova                                                                                         |
| -------- | --------------------------------------------------------------------------------------------- |
| H19-01   | Janela 14 dias, paginação e falha na segunda página sem efeitos                               |
| H19-02   | Título/descrição, ID determinístico e recuperação sem nova criação                            |
| H19-03   | Apagado/movido, CAS auditado, repetição e preservação de FKs/histórico                        |
| H19-04   | 24h publica; 2h/6h, limite exato, preparo e teto impedem publicação; encaixe anterior fechado |
| H19-05   | Revogação, API indisponível e troca de agenda descartam dados inseguros                       |
| H19-06   | Expediente local, 30 minutos, bloqueio por evento manual/dia inteiro, sem duplicar            |
| H19-07   | Conflito real do índice ativo retorna 409, sem vaga ou log duplicados                         |

## Limites

Sem homologação com Google/Resend reais. E-mail usa as tentativas existentes do EmailService; falha final após commit é registrada sem bloquear os outros avisos, sem nova outbox. Duração de 30 minutos é decisão explícita enquanto o modelo não possui duração de exame. Node recomendado pelo projeto é 24; a verificação disponível foi executada em 26.3.0.
