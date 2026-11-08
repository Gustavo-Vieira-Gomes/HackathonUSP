# Deploy HTTPS — HACK-14

Card: https://linear.app/workspace-do-gustavo/issue/HACK-14

Status: preparação integrada à primeira migration de domínio; nenhum host ou banco remoto foi provisionado por esta entrega. HACK-12 e a fatia 1 do HACK-13 estão na base. Faltam acesso às contas e URLs definitivas.

## Migration liberada

O [PR #5](https://github.com/Gustavo-Vieira-Gomes/HackathonUSP/pull/5), squash `26d6e45`, entregou `20261108032558_hack_13_clinica_exame_paciente_inscricao`. Ela cria `Clinic`, `ClinicOpeningHours`, `Exam`, `PriceStep`, `Patient`, `Subscription` e `SubscriptionWindow`, com índices, FKs e dois CHECKs em `Exam`. A migration de autenticação `20261108025102_init_auth` foi preservada. O `migrate deploy` configurado no start aplica ambas em ordem.

Evidências da entrega: `.specs/features/hack-13-modelo-dados/verification.md` e testes `apps/api/src/prisma/domain-schema.test.ts`, executados contra Postgres na revisão. O estado Done do HACK-13 no Linear não equivale à entrega da fatia 2: a revisão ainda registra `Slot`, `Vacancy`, `Reservation`, `Alert`, `Transition` e RN-41 como pendentes. Essa limitação não impede publicar a primeira fatia, mas não permite apresentar reserva transacional como pronta.

## Acessos necessários para publicar

Na retomada, não havia CLI dos hosts, sessão local de CLI, variáveis de credenciais nem integração instalada para Vercel, Render ou Neon. Disponibilizar o acesso por integração autenticada ou sessão local do provedor, sem colar tokens, senhas ou conexão de banco no chat/Linear/PR.

| Provedor | Acesso necessário                                                                                                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel   | Conta/time do projeto; permissão para importar este repositório, criar/configurar o projeto `apps/web`, definir variáveis Production e publicar/consultar deploys. Se já existir projeto, informar seu nome/ID e time, sem credenciais.         |
| Render   | Workspace e autorização do GitHub para este repositório; permissão para criar/configurar o serviço web pelo Blueprint, definir secrets e consultar deploys/logs. Se já existir serviço, informar nome/ID.                                       |
| Neon     | Projeto e branch de banco exclusivos do ambiente; permissão para obter/configurar a conexão TLS no Render e aplicar migrations com criação de tabelas, índices e FKs. Informar projeto/branch/banco escolhidos, sem enviar a conexão pelo chat. |

Após autenticar os provedores, conferir os recursos existentes antes de criar novos, definir as URLs dos dois hosts, configurar `BETTER_AUTH_URL`, `WEB_ORIGIN` e `API_BASE_URL`, aplicar as migrations no banco escolhido e executar o aceite abaixo. Não há URL pública comprovada nesta etapa.

## Topologia e sessão

Navegador → Next (Vercel) → Nest (Render) → Postgres (Neon).

Usar os Route Handlers existentes `/api/auth/*` e `/api/sign-up/{paciente,clinica}` no domínio Next. Eles repassam `Origin`, corpo, cookie e `Set-Cookie`. O navegador guarda o cookie host-only no domínio Next; Server Components repassam esse cookie a `/api/me` no Nest. `BETTER_AUTH_URL` é a URL HTTPS do Nest, sem `/api/auth`; `WEB_ORIGIN` é a origem HTTPS exata do Next, sem caminho nem barra final. A stack já usa essa origem em `trustedOrigins`.

Esse fluxo usa requisições do mesmo domínio no navegador e não exige CORS HTTP entre Vercel e Render. Não configurar `Domain` no cookie nem `SameSite=None` para unir dois domínios de fornecedores. Chamadas futuras diretamente do navegador à API exigem CORS com a origem exata e credenciais; socket.io e seu handshake autenticado pertencem ao HACK-38. Não habilitar wildcard ou tratar o gateway de exemplo como proteção operacional.

## IP confiável e rate limit — revisão R2

O Next descarta `X-Forwarded-For`, `X-Real-IP`, `Forwarded` e os headers internos fornecidos pelo navegador. Somente no runtime Vercel (`VERCEL=1`, variável do host) ele lê um único IPv4/IPv6 válido de `x-vercel-forwarded-for`. IP ausente, lista, valor inválido, runtime remoto desconhecido ou configuração de credencial inválida retorna 503 antes de chamar o Nest. Não há fallback para IP de outro header, primeiro membro de lista ou balde público comum. Um proxy/CDN extra antes da Vercel muda qual peer ela enxerga: esta configuração exige acesso direto à borda Vercel; reavaliar a cadeia antes de adicionar outro CDN.

O IP é transportado em `x-hackathon-client-ip`, junto de `x-hackathon-proxy-key` obtido de `AUTH_PROXY_SECRET` server-only. A API aceita esse IP nas rotas `/api/auth/*` e `/api/sign-up/*` apenas se a credencial interna coincidir. Acesso direto à URL Render sem chave válida dá 403, mesmo com headers falsificados; IP ausente/inválido com chave válida dá 400. A chave é removida antes do router. Better Auth lê **somente** `x-hackathon-client-ip`, sem fallback para XFF ou endereços adicionados pelo Render. `/api/health` permanece público; `/api/me` mantém autorização por cookie e não ganha confiança em headers de IP externos.

Configuração obrigatória antes de publicar:

1. Gerar 32 bytes aleatórios (`openssl rand -hex 32`) e guardar o mesmo valor de 64 dígitos hexadecimais como `AUTH_PROXY_SECRET` no Render e nas variáveis **server-only Production** da Vercel. É uma credencial de transporte distinta de `BETTER_AUTH_SECRET`, não uma credencial de usuário. Não expor em `NEXT_PUBLIC_*`, respostas, código cliente ou logs. Rotacionar nos dois hosts em conjunto se houver exposição.
2. Manter `NODE_ENV=production` no Nest: o boot falha sem chave válida. O Blueprint exige entrada dessa variável secreta; não gera chaves independentes nos dois hosts. A Vercel deve expor suas system environment variables para que `VERCEL=1` exista em runtime; não definir esse sinal manualmente em outro host.
3. Usar `API_BASE_URL` HTTPS. O proxy não transmite a chave por HTTP público e não segue redirects. O segredo só pode estar no Next/Nest do mesmo ambiente, sem compartilhamento com previews, terceiros ou código cliente.
4. Desenvolvimento/smoke local admite apenas Next e upstream em loopback. Sem chave, o Nest ignora headers de IP e usa o peer da conexão. Com chave (smoke do build Next), o proxy usa o IP fixo de loopback; isso não representa validação da borda pública. Nenhum runtime público diferente da Vercel é autorizado por esse caminho local.

O limiter nativo de login fica habilitado em produção ou quando a credencial do proxy está configurada, inclusive em testes. Seu armazenamento continua em memória por instância: não escalar nem prometer limites globais sem definir armazenamento compartilhado. O cadastro separado usa `auth.api`, ao qual o rate limiter HTTP do Better Auth não se aplica; esta correção garante procedência do IP e restringe ingresso do cadastro, sem declarar que adicionou limite de cadastro.

Teste obrigatório nos hosts: enviar XFF e os headers internos falsificados ao Next e confirmar que o login segue associado ao IP real observado pela borda; variar XFF não deve evitar 429. Outra conexão/IP deve ter contagem própria. Na URL Render, tentar os mesmos headers sem chave deve dar 403; health deve continuar 200. Não criar endpoint de diagnóstico que exponha IPs ou a credencial. As provas locais/CI validam a aplicação, mas não demonstram que o host sobrescreveu um header: registrar também essa verificação no aceite público.

## Antes de conectar o banco

1. Confirmar que o SHA a publicar contém `26d6e45` (primeira fatia HACK-13) e os dois diretórios de migration acima. O SQL e a revisão foram conferidos nesta retomada; a dependência da primeira migration está satisfeita. Não aplicar a partir de uma branch antiga que contenha só a migration de autenticação.
2. Criar/selecionar o projeto Neon e um branch de banco exclusivo para este ambiente. Copiar a conexão Postgres com TLS fornecida pelo painel, mantendo `sslmode=require` e demais parâmetros. Não desativar validação TLS para contornar falha.
3. Guardar a conexão somente em `DATABASE_URL` no Render. Não adicionar a conexão ao Next, ao Git, à descrição do PR ou aos logs. Para esta primeira instância usar a conexão direta, compatível com a execução de migrations no start; avaliar pooling separadamente se houver mais instâncias.

## Render: API

Importar `render.yaml` da raiz do repositório com a branch de entrega já revisada. Não usar `apps/api` como Root Directory: o build precisa do lockfile raiz e de `packages/contracts`. O Blueprint usa plano free e deploy automático desligado; a criação inicial ainda dispara um deploy, portanto só importar após liberar a migration e configurar as variáveis.

| Variável             | Valor no host                                                |
| -------------------- | ------------------------------------------------------------ |
| `NODE_VERSION`       | `24`                                                         |
| `NODE_ENV`           | `production`                                                 |
| `HOST`               | `0.0.0.0`                                                    |
| `PORT`               | Fornecida pelo Render; não fixar                             |
| `DATABASE_URL`       | Conexão TLS do Neon                                          |
| `BETTER_AUTH_SECRET` | Gerado pelo Blueprint; manter estável entre deploys          |
| `BETTER_AUTH_URL`    | `https://<api>.onrender.com`                                 |
| `WEB_ORIGIN`         | `https://<web>.vercel.app` ou domínio definitivo             |
| `AUTH_PROXY_SECRET`  | Mesmo segredo hexadecimal server-only da Vercel (64 dígitos) |

Build: `npm ci --include=dev`, build de contracts e build da API. Prisma gera o cliente durante instalação/build sem acessar o banco. Start: `npm run db:deploy -w @hackathon/api && npm run start -w @hackathon/api`. Aplicar somente migrations versionadas (`migrate deploy`); nunca `migrate dev`, `db push` ou reset no Neon compartilhado. Se migration falhar, o processo não inicia. Não escalar essa configuração para várias instâncias sem mover migrations para uma etapa única de release.

Health check: `/api/health` é liveness, não comprova banco, autenticação nem WebSocket. O plano free pode suspender a instância; aquecer antes do ensaio e avaliar um plano sem suspensão com o responsável antes da apresentação. Não contratar plano pago implicitamente.

## Vercel: web

Importar o repositório como Next.js, Root Directory `apps/web`, Node 24, com **Include source files outside of the Root Directory in the Build Step** habilitado. Manter Output Directory padrão do Next. `apps/web/vercel.json` instala pelo lockfile raiz e compila contracts antes do Next, sem construir a API.

Definir `API_BASE_URL=https://<api>.onrender.com` como variável de servidor no ambiente Production. Não usar prefixo `NEXT_PUBLIC_`. Definir URLs definitivas antes do teste de sessão, atualizar `WEB_ORIGIN` no Render e fazer os deploys correspondentes. Preview tem outra origem: não usar preview contra banco de produção nem liberar `*.vercel.app` em `trustedOrigins`; criar ambiente isolado se for necessário testar preview autenticado.

## Verificação pública e aceite

Registrar no card data, SHA publicado, URLs e resultados, sem cookies, senhas ou dados pessoais. Usar uma conta de teste própria da demo.

1. Abrir `https://<api>/api/health`: 200 e `{ "status": "ok", "service": "api" }`.
2. Abrir `https://<web>/api/health`: 200 e `{ "status": "ok", "service": "web" }`. Abrir home: 200 e “API conectada”.
3. No celular, fazer cadastro/login pela interface do Next (quando HACK-16/HACK-23 disponibilizarem a tela). Enquanto não houver tela, o repasse HTTP pode ser verificado com cliente HTTP, mas isso não comprova o critério de login no celular.
4. Conferir resposta de login: cookie de sessão com `Secure`, `HttpOnly`, `Path=/`, sem `Domain` externo; não copiar seu valor para evidências. Recarregar a home e confirmar sessão ativa. Fechar/reabrir a página no mesmo navegador e repetir. Verificar logout e acesso sem sessão.
5. Verificar HTTPS sem aviso de certificado, ausência de mixed content e ausência de secrets no bundle. Testar o handshake socket.io depois da integração HACK-38; não exigir que um cookie do domínio Vercel seja enviado automaticamente ao domínio Render.

Não marcar HACK-14 Done somente porque build ou liveness passou. URLs públicas, migration aplicada e persistência de login no celular são obrigatórios. Registrar bloqueios de conta, migration ou interface no Linear.

## Referências operacionais

- [Blueprint Render](https://render.com/docs/blueprint-spec): campos de serviço, variáveis, build e start; pre-deploy é restrito a planos pagos.
- [Monorepos Vercel](https://vercel.com/docs/monorepos/monorepo-faq): acesso aos pacotes fora do Root Directory.
- [Build Vercel](https://vercel.com/docs/builds/configure-a-build): comandos de instalação e build por projeto.
- [Headers Vercel](https://vercel.com/docs/headers/request-headers): XFF sobrescrito pela borda e `x-vercel-forwarded-for`.
- [IP e rate limit Better Auth](https://better-auth.com/docs/concepts/rate-limit): limitar aos headers do proxy confiável e impedir ingresso direto; chamadas `auth.api` não passam pelo limiter HTTP.
- [Proteção Render](https://render.com/articles/how-render-handles-ddos-attacks): tráfego via Cloudflare/load balancers, IP de peer do socket e limites da proteção de borda. A aplicação não presume que XFF que chegou ao Render prove a origem do navegador na Vercel.
