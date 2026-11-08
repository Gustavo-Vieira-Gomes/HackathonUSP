# HACK-24 — Lista de encaixe

Escopo grande (API, contratos, fluxo mobile); Specify → Design → Tasks → Execute, sem pausa conforme autorização.

## Critérios P1

- SUB-01 (RN-17): quando paciente conclui passos exame, região/raio, preço e janelas, persistir inscrição própria com localização para posso ir hoje.
- SUB-02 (RN-19): quando MatchingService encontra vaga compatível ao concluir, encaminhar ao aceite /paciente/vagas/:id.
- SUB-03: quando não há vaga, mostrar nenhuma vaga agora, clínicas na região e link reserva comum.
- SUB-04 (RN-20): expirar em 30 dias pelo ClockService, enviar e-mail de renovação e renovar mesma inscrição.
- SUB-05 (RN-21): janela seg–sex 18–21 não corresponde a sábado 10h; reutilizar matching existente.
- SUB-06: uma inscrição por paciente/exame, acesso restrito ao dono pelo guard HACK-23.
- SUB-07: solicitar push apenas após inscrição via componente HACK-35 quando disponível.

Fora: foto HACK-39, aceite HACK-26, reserva HACK-25, deploy e fornecedor pago. Links são pontos de integração.
