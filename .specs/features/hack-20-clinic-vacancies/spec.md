# HACK-20 — Publicar horário vazio e declarar no-show

## Escopo e critérios

- R1 (RN-22/23): clínica autenticada publica horário vazio de exame próprio; início estritamente além do preparo e antecedência mínima. USG com preparo 8 h para 3 h retorna 422 com “antecedência menor que o preparo”.
- R2 (RN-28): publicação via PricingService.publishWithinDailyCap e VacanciesService.publish, preço do degrau atual. Sexta publicação com teto 5 retorna 422 e teto.
- R3 (RN-29): reservas de hoje mostram ação permitida pelo ClockService após tolerância X. 14h10/X15 bloqueia; 14h16 permite. Declaração registra Reservation no_show e transição, preservando o sinal.
- R4: vaga reservada antiga é cancelada por VacanciesService, origem clinica. Gancho transacional NoShowMotorService.onDeclared para HACK-33; não publica vaga imediata.
- R5: /clinica/vagas mostra formulário, estados das vagas, reservas do dia, carregamento, erro, vazio e sucesso; servidor valida e autoriza por clínica.

## Design e decisões

Módulo clinic-vacancies coordena serviços existentes, sem alterar o serviço compartilhado com HACK-19. Contratos Zod transportam apenas dados de tela. Formulário informa início e fim porque Exam não possui duração. Horários digitados em America/Sao_Paulo; transporte UTC. Teto usa relógio real por contrato do PricingService; negócio usa ClockService. Sem migration: modelos existentes cobrem o fluxo.

## Verificação

Testes proporcionais dos limites de preparo, tolerância, autorização e transação; check, build e smoke HTTP em banco local hack_20. Provas e limites em verification.md.
