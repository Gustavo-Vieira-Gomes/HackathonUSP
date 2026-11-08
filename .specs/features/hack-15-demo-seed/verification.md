# HACK-15 — verificação da entrega

## Escopo final

`spec.md` substitui plano/checklist do WIP. Apenas seed, migration de marcação, default Prisma de User.id, comando npm e documentação. Módulos de clínica, web e contratos preservados de main `0d7ee6e`.

## Provas

- Banco exclusivo: Docker Compose do worktree HACK-15, Postgres 17, porta 5415, banco `hack_15`.
- Nove migrations aplicadas com sucesso via `npm run db:deploy -w @hackathon/api`.
- `npm run seed` executado duas vezes: ambas retornaram `clinics:10, exams:100, patients:12, subscriptions:12, windows:84`.
- Teste de integração verifica identidades e createdAt preservados, 70 expedientes, 300 degraus e 84 janelas após repetir.
- Teste de integração compara catálogo/questionários e RM 72000/50000; matching SQL verifica doze candidatos em ordem; colisão provoca rollback completo.
- Autoverificação independente somente leitura não encontrou bloqueio; revisão da esteira continua com o maestro após a PR.

## Ambiente e limites

A cópia de node_modules do checkout principal não continha Prisma. Foi necessário `npm ci` no worktree, sem mudança de dependências ou lockfile. Execução com Node v26.3.0 disponível nesta máquina (engine do projeto >=22.12.0); não validado em Node 24 nesta retomada.

Clínicas/endereço/CNES/coordenadas vêm do manifesto pesquisado do handoff. Sites oficiais SCOPP/CURA/CDB reconsultados; não houve nova geocodificação. Preços, expediente, disponibilidade e pacientes são sintéticos. E-mail usa `.invalid`; WhatsApp só tem entrega demonstrável com modo `simulated`, sem envio externo pelo seed. Nenhuma conta recebe senha ou sessão; nenhum token Google é fabricado. Questionários continuam com revisão clínica pendente.

## Gates

- `npm run check`: passou (API 350/350, web 40/40, contratos 19/19; zero skipped). Lint, tipos e formatação verdes.
- SQL após os testes: 10 clínicas de demo, exatamente 2 com `demoCalendarTarget`.
- `npm run build`: passou (contratos, Nest e Next em produção).
- `npm run smoke`: passou (saúde, cadastro/login/sessão, clínica/exames, socket, WhatsApp com credencial, fallback/502).
- Gates pesados serializados pelo lock global `.worktrees/.lock-pesado`. Smoke usa os doubles já previstos pelo repositório para serviços externos; não prova OAuth/envio real.

## Rastreabilidade

H15-01 a H15-04 verificados: SQL/manifesto e dois alvos; catálogo/questionários/preços; matching real com doze candidatos; repetição preservando IDs e rollback. Nenhuma obrigação pendente de implementação neste card.
