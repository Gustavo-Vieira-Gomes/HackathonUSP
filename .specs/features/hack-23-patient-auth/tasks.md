# Execução

1. [x] Backend: completar cadastro existente, resolver paciente da sessão, consultas por ownership e retenção. Testes HTTP/banco e limites temporais. Reusa SignUpService, Better Auth e ClockService. Arquivos: auth, modules/patients, app.module, contracts e fixtures afetadas.
2. [x] Frontend: rotas /paciente/cadastro, /paciente/login e /paciente; reusa proxies e sessão existentes. Verificar tipos/build e smoke. Arquivos: apps/web/app/paciente e core/modules/patient.
3. [x] Integração: adaptar smoke ao contrato, merge main atual, check/build/smoke, registrar provas e publicar PR. Sem dependência nova.

Assumimos retenção a partir do fim do horário do exame; demais decisões registradas em STATE.md. Sem alteração nas regras de negócio.
