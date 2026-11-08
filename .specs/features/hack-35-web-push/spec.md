# HACK-35 — Web push

Escopo médio: reutilizar NotificationsService e ChannelAdapter, sem arquitetura nova.

- P1: chaves VAPID opcionais; sem configuração o adapter não é registrado (sem_canal).
- P2: subscriptions persistidas por paciente, operações autenticadas e validadas; 404/410 removem subscriptions inválidas.
- P3: PWA instalável; service worker mostra texto comum dos canais e abre somente a vaga da mesma origem.
- P4: PushPermission exportado com prop subscribed; pedido só por gesto após inscrição. Recusa não bloqueia inscrição nem outros canais.
- P5: testes com transporte falso, check/build/smoke e tentativa de cliente real localhost; registrar limites observados.

## Plano de execução

1. Backend e migration, adapter e testes de envio/falhas/autorização.
2. Manifest, worker, componente pós-inscrição e testes de comportamento.
3. Atualizar main, validar gates, registrar evidências e abrir PR.

Arquivos: notifications/push, módulo de notifications, Prisma/schema+migration, contracts/push, env example, web/app/manifest, public/sw e ícones, proxy push, módulo web notifications, next.config e layout.

Premissas: sem offline/cache de dados de saúde; canal escolhido em alertChannels; HACK-24 montará o componente após inscrição (decisão explícita do maestro). Sem página fictícia.

## Referências verificadas

- [Next PWA](https://nextjs.org/docs/app/guides/progressive-web-apps): manifest, worker e permissão por gesto.
- [web-push](https://github.com/web-push-libs/web-push/blob/master/README.md): VAPID, timeout e topic.
- Fonte existente de URL: WavesService passa a gerar `/paciente/vagas/:id`, compartilhada por todos os canais (brief HACK-35).
