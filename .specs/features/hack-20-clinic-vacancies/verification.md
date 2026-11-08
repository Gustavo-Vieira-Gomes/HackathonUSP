# Verificação HACK-20

- Base main atualizada via HTTPS antes dos gates; sem alterações adicionais remotas na segunda conferência.
- `npm run check`: verde; API 352, web 43, contratos 19 testes. Zero falhas e skips; lint, tipos e formatação verdes.
- `npm run build`: verde; rota dinâmica /clinica/vagas e proxies incluídos.
- `npm run smoke`: verde, com publicação real pelo Next, vaga na tela SSR, paciente recusado com 403 e redirecionamento anônimo ao login.
- Gates pesados serializados pelo lock global do contrato. Banco local isolado hack_20, porta 54320, migrations existentes aplicadas.

## Critérios rastreados

- R1: unitários comprovam preparo 8h/antecedência 3h recusado e limite estrito da antecedência mínima; HTTP comprova payload inválido e exame alheio recusados.
- R2: HTTP comprova preço vigente, 5 publicações e sexta 422 com teto 5, sem slot órfão; serviço usa trava/transação do PricingService.
- R3/R4: HTTP real com ClockService controlado comprova GET false e POST422 às 14h10; GET true e POST201 às 14h16; reserva no_show, sinal 10000 intacto, vaga antiga cancelada, logs clinica e gancho dentro da transação. Outra clínica404, paciente403, repetição409.
- R5: testes web comprovam conversão São Paulo→UTC, mensagens de erro e validação de resposta/sessão encaminhada; smoke comprova integração Next/Nest e renderização SSR.

## Limites

HACK-33 não implementado: não há publicação imediata por no-show, apenas NoShowMotorService.onDeclared. Sinal preservado no registro existente, sem gateway financeiro neste card. Não houve teste visual interativo em navegador; a interface foi validada por tipos, testes e HTML no smoke. Sem dependências novas, alterações de schema ou deploy.
