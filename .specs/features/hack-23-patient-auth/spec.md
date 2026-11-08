# HACK-23 Cadastro e login do paciente

Escopo médio: completar a fundação existente; sem nova autenticação.

- AUTH-01 (RN-11/F1): cadastro name/email/phone/password com healthDataConsent=true cria User Better Auth e Patient com instante do servidor. Sem aceite retorna 422 consentimento obrigatório e não cria conta.
- AUTH-02 (F1): telas mobile first de cadastro/login com estados de erro e carregamento, sessão Better Auth e área paciente.
- AUTH-03 (RN-12): reservas e inscrições consultadas pela identidade da sessão; recurso alheio/inexistente retorna 404 sem campos.
- AUTH-04 (RN-13): job usa ClockService.now e apaga reservas 30 dias após exame e inscrições 30 dias após expiração, incluindo dependentes que impedem exclusão.

Verificação: testes HTTP reais de cadastro/login/ownership e banco, fronteira temporal de retenção; npm run check, npm run build, npm run smoke.
Fora: criação de reservas/inscrições (outros cards), deploy e provedores pagos.

## Rastreabilidade

| Requisito | Prova                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| AUTH-01   | patients.http.test: recusa sem aceite/sem conta; telefone e instante exato de ClockService; sessão                        |
| AUTH-02   | smoke.mjs: telas públicas, cadastro/login via Next, área SSR com cookie; testes auth-errors/phone-input                   |
| AUTH-03   | patients.http.test: João 200, Maria 404 sem campo do recurso, anônimo 401 e clínica 403                                   |
| AUTH-04   | patients.http.test: limite inclusivo de 30 dias, preservação de inscrição recente, exclusão de dependentes e idempotência |

Validação visual interativa não realizada; a autorização é para execução autônoma. Artefatos existentes em README e docs/architecture já descrevem a navegação; não duplicar em notebook.
