# Verificação HACK-35

## Cliente real localhost

Chrome instalado, Playwright, servidor temporário em `http://localhost:3135`, worker real de `apps/web/public/sw.js`.

Resultado observado: `isSecureContext=true`, permissão de notificações `granted`, PushManager disponível. Registro do worker e `showNotification` reais funcionaram; `getNotifications()` devolveu título/corpo esperados. A criação da subscription no Chrome automatizado falhou com `Registration failed - permission denied`, mesmo com permissão de notificações granted. Portanto **entrega ponta a ponta pelo provedor de push não foi comprovada** neste ambiente. Não há subscription real inventada nem envio externo apresentado como validado.

## Integração pendente deliberada

O maestro confirmou que HACK-24 montará `PushPermission` após persistir inscrição, passando `subscribed=true`. Antes disso o componente exportado está disponível e testado, sem página fictícia. Permissão depende de clique, nunca de primeira visita.

## Reprodução manual com navegador compatível

1. Configurar VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT no Nest; gerar com `npx web-push generate-vapid-keys`.
2. Migrar banco e subir API/Next em localhost. Login como paciente; HACK-24 deve montar o componente após inscrição.
3. Ativar push e permitir no navegador; confirmar subscription persistida. Publicar vaga compatível pelo fluxo existente, com push/email em alertChannels.
4. Confirmar texto RN-35 e clique em `/paciente/vagas/:id`. Revogar permissão e repetir, confirmando que outros canais não são bloqueados.

Sem HTTPS/deploy, cache offline ou alterações no motor de matching.

## Gates finais — 08/11/2026

- Base `main` atualizada por HTTPS e integrada até `0e68bd3` (HACK-19). Código verificado em `daf6960cb2683c7c66e2c49a30f3be0c08f02d26`.
- `npm run check`: verde, 448 testes (378 API, 50 web, 20 contratos), zero falhas e zero ignorados; lint, tipos e formatação verdes.
- `npm run build`: verde, contratos → Nest → Next.
- `npm run smoke`: verde. Além dos fluxos existentes, manifest standalone, ícones, worker sem cache e endpoint de chave push via proxy com/sem sessão verificados por HTTP.
- Migration nova aplicada ao Postgres isolado `hack_35`, porta 54335. Testes novos: 9 backend + 1 contrato + 4 frontend; transporte web-push falso cobre envio conjunto ao e-mail, ausência de canal, falhas e remoção 404/410.
- Dependência `web-push` 3.6.7 adicionada por exigência T5 do card, com tipos compatíveis; sem outro serviço ou fornecedor novo.

Verificados P1–P4 e P5 dentro do limite de cliente real descrito acima. A montagem pelo HACK-24 permanece deliberadamente fora da entrega conforme autorização do maestro.
