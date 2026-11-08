# HACK-19 — Sincronização da Google Agenda

Escopo médio: RN-05 a RN-10, RN-23, RN-50; cenários F3. Sem UI, deploy ou credenciais reais.

## Critérios

- H19-01: WHEN passa um minuto THEN ler os próximos 14 dias por clínica conectada, com timeout e paginação completa antes dos efeitos.
- H19-02: WHEN reserva confirmada não tem evento THEN criar `[TUSS] nome`, descrição com id da reserva, persistindo id somente após confirmação Google.
- H19-03: WHEN evento identificado da reserva é apagado/movido THEN cancelar a reserva uma vez, registrar Transition e avisar paciente; nunca mover slotId/clinicId.
- H19-04: WHEN cancelamento está estritamente além da antecedência mínima e preparo THEN publicar encaixe no horário original, respeitando preço/teto diário e registrando Transition. Com 2h e mínimo 6h, só cancelar.
- H19-05: WHEN Google falha/token revogado THEN desconectar, avisar clínica e não aplicar snapshot parcial ou antigo.
- H19-06: WHEN há intervalo livre no expediente THEN materializar Slot comum; evento manual não identifica reserva nem causa cancelamento por título.
- H19-07: WHEN publicação repetida viola unicidade THEN responder 409 sem Transition extra; entrada só aceita slotId, origin, currentPriceCents.

## Execução

1. Endurecer publish e centralizar cancelamento transacional em VacanciesService; testes DB de conflito e idempotência.
2. Job de sincronização e wiring em GoogleCalendarModule; testes com Google falso e Postgres local.
3. Integrar main atual e verificar check/build; publicar PR e avisar maestro.

## Premissas / arquivos

Sem duração de exame no modelo: fatias de 30 minutos (padrão das fixtures), somente dentro do expediente de São Paulo; sem publicar encaixe por mero vazio. Arquivos: vacancies.service.ts/test.ts, google-calendar/calendar-sync*.ts e google-calendar.module.ts. Sucesso: critérios F3 e testes de falha, check/build verdes.

## Resultado

H19-01 a H19-07 verificados. Evidências, contagens e limites em [validation.md](validation.md). Sem desvio das regras do card; a duração de Slot é a premissa registrada acima.
