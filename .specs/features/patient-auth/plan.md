# Funcionalidade: cadastro e login de paciente (HACK-23)

## Resultado e escopo

Paciente cria conta com nome, e-mail, telefone e senha, aceita o tratamento de dados de saúde e recebe sessão Better Auth. Login reutiliza a mesma infraestrutura. A interface está em `/paciente/cadastro` e `/paciente/login`.

A main sincronizada em `26d6e45` contém somente a fatia 1 do HACK-13: Patient e Subscription, sem Slot, Vacancy ou Reservation. Apesar do status completed no Linear, o critério Maria/João para reservas e a retenção após exame dependem da fatia 2. Esta entrega implementa os limites existentes e não cria um modelo paralelo de reservas. HACK-23 permanece incompleto até essa dependência chegar.

## Critérios observáveis

- Consentimento ausente, falso ou textual retorna 422, mensagem `consentimento obrigatório`, sem criar conta nem emitir cookie.
- Cadastro válido fixa `role = paciente` no servidor e persiste telefone e instante UTC do aceite.
- Falha na persistência do perfil reverte conta, credencial e sessão na mesma transação Postgres.
- Login por e-mail e senha emite cookie HttpOnly.
- `GET /api/patient/subscriptions/:id` exige sessão e filtra pelo usuário dono. Outro paciente, clínica ou recurso inexistente recebem o mesmo 404; payload não inclui localização nem dados pessoais.
- Job horário remove inscrições expiradas há pelo menos 30 dias, incluindo suas janelas por cascade. Reexecução é idempotente e preserva perfil e consentimento.

## Caminho e contratos

Contrato `patientSignUpBodySchema` em contracts; cadastro e Better Auth em `apps/api/src/auth`; consulta e retenção no módulo patients. Conta, sessão e Patient são gravados por uma única transação, sem autenticação própria. O contrato de clínica permanece igual. Consumidores do cadastro de paciente precisam enviar `phone` e `healthDataConsent: true`.

O job usa `expiresAt`, única data terminal disponível para inscrições. Reservas deverão usar a data do exame/expiração definida pelo modelo canônico quando existir. O job não infere realização por `updatedAt`.

## Passos

1. Conferir card, discussão, dependências e PRs; sincronizar main sem alterar trabalho existente e criar worktree.
2. Validar cadastro e persistir perfil atomicamente; reaproveitar login/proxy.
3. Aplicar propriedade na consulta de inscrições e retenção horária.
4. Exercitar HTTP e Postgres reais, portais mobile/desktop, checks, build, smoke e revisão do diff.

## Verificação

Testes em `patients.http.test.ts` cobrem consentimento, perfil, login, isolamento, limite temporal e rollback com falha real no banco. Suites anteriores continuam cobrindo os dois papéis e o bloqueio do cadastro público direto no Better Auth. Não há mock de persistência.

Ambiente local: Docker instalado, mas daemon desligado e inicialização exige senha. Alternativa: Postgres 16 temporário do pacote pgserver, fora do repositório, acessível por socket Unix. CI mantém Postgres 17 do projeto. Evidências finais no PR.
