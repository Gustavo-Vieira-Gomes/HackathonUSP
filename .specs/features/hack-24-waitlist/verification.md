# Verificação HACK-24

Base main integrada: 957cf9e (HACK-15), após base inicial f59b350 (HACK-23).

- `npm run check`: verde; API 358 + web 48 + contratos 20 = 426 testes, zero falhas/skips. Lint, tipos e Prettier verdes.
- `npm run build`: contratos, Nest e Next verdes; rotas de inscrição presentes no build.
- `npm run smoke`: verde, incluindo POST inscrição pelo proxy Next, persistência, clínicas na região, lista SSR vazia de vagas e renovação mantendo ID.
- Banco local exclusivo hack_24, porta 54324; migrations aplicadas com `db:deploy`.
- Execução no slot .worktrees/.lock-pesado-2; slot próprio liberado ao concluir.

## Critérios

SUB-01/03: schemas, testes HTTP e smoke provam persistência, clínicas e vazio; interface de quatro passos compilada. SUB-02/05: teste HTTP usa vaga sábado 10h e compara janela seg–sex com inclusão de sábado; mesma inscrição passa a devolver a vaga imediatamente. SUB-04: relógio avançado para expirar, e-mail testado duas vezes com um envio por ciclo, renovação reativa mesma linha. SUB-06: sessão alheia lista vazia e renovar retorna 404; reinscrição mantém ID. SUB-07: TODO de uma linha autorizado pelo usuário enquanto HACK-35 não entrou em main; montagem delegada ao HACK-35.

## Limites

Sem envio Resend real (sem credenciais; EmailService simulado no teste), sem chamada ao geocodificador público e sem teste visual automatizado do wizard/geolocalização. Aceite, reserva comum e foto são pontos de integração dos outros cards. Sem deploy.
