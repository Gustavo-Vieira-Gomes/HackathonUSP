# Verificação HACK-23

- `npm run check`: passou. API 349/349, web 46/46, contracts 19/19 (414 testes, zero falhas e zero ignorados); lint, tipos e formatação verdes.
- `npm run build`: passou (contratos, Nest e Next). Rotas paciente renderizadas no build, sem rede externa.
- `npm run smoke`: passou com Postgres local isolado hack_23, porta 5423. Cadastro e login reais via Next, recusa de consentimento com 422, área SSR com cookie e 404 nas páginas de reserva/inscrição inexistentes, além dos smokes existentes.
- API HTTP/banco: consentimento obrigatório sem conta, timestamp exato de ClockService, João 200/Maria 404 sem dados, anônimo 401/clínica 403, retenção no limite de 30 dias e dependentes removidos; inscrição recente preservada; repetição idempotente.
- Regressão encontrada no gate inicial: AuthModule passou a depender do relógio sem importá-lo; import explícito corrigido e teste existente H18-C46 passou sem mudanças.
- Main remoto integrado antes do gate final; sem dependências ou migrations novas.

AUTH-01, AUTH-02, AUTH-03 e AUTH-04: verificados. Não foi feita UAT visual interativa. Não há prova de fornecedor externo nem deploy; não fazem parte deste card. O ensaio RED inicial teve erro de runner, portanto não é apresentado como prova funcional RED.
