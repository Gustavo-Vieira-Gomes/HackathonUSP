# Agenda Google — HACK-19

- `apps/api/src/modules/google-calendar/google-calendar-connection.service.ts:getAuthorizedCalendar` é o dono dos tokens cifrados e cliente autenticado; consumidores não leem tokens diretamente.
- `google-oauth.client.ts:calendarFor` configura timeout de 10s e retry desabilitado. A listagem de eventos precisa consumir `nextPageToken` antes de decidir ausência (referência: https://developers.google.com/workspace/calendar/api/v3/reference/events/list).
- `apps/api/src/modules/vacancies/vacancies.service.ts` é dono das transições de vaga e do cancelamento auditado da reserva pela agenda. `publish` aceita só três campos e traduz unicidade para conflito.
- Slot não possui flag de disponibilidade e Exam não define duração. HACK-19 usa blocos de 30 minutos em expediente de São Paulo e preserva horários com histórico; decisão em `.specs/project/STATE.md`.
- `PricingService.publishWithinDailyCap` deve compartilhar a transação do chamador; não capturar P2002 e continuar usando uma transação Postgres abortada.
