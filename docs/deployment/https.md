# Deploy HTTPS — HACK-14

Card: https://linear.app/workspace-do-gustavo/issue/HACK-14

Status: preparação; nenhum host ou banco remoto foi provisionado por esta entrega. Aguarda primeira migration de domínio do HACK-13, acesso às contas e URLs definitivas. HACK-12 está integrado na base.

## Topologia e sessão

Navegador → Next (Vercel) → Nest (Render) → Postgres (Neon).

Usar os Route Handlers existentes `/api/auth/*` e `/api/sign-up/{paciente,clinica}` no domínio Next. Eles repassam `Origin`, corpo, cookie e `Set-Cookie`. O navegador guarda o cookie host-only no domínio Next; Server Components repassam esse cookie a `/api/me` no Nest. `BETTER_AUTH_URL` é a URL HTTPS do Nest, sem `/api/auth`; `WEB_ORIGIN` é a origem HTTPS exata do Next, sem caminho nem barra final. A stack já usa essa origem em `trustedOrigins`.

Esse fluxo usa requisições do mesmo domínio no navegador e não exige CORS HTTP entre Vercel e Render. Não configurar `Domain` no cookie nem `SameSite=None` para unir dois domínios de fornecedores. Chamadas futuras diretamente do navegador à API exigem CORS com a origem exata e credenciais; socket.io e seu handshake autenticado pertencem ao HACK-38. Não habilitar wildcard ou tratar o gateway de exemplo como proteção operacional.

## Antes de conectar o banco

1. Aguardar a primeira migration de domínio do HACK-13 integrada à `main` e revisar os SQLs com o responsável. A migration de autenticação do HACK-12 sozinha não satisfaz esse acordo.
2. Criar/selecionar o projeto Neon e um branch de banco exclusivo para este ambiente. Copiar a conexão Postgres com TLS fornecida pelo painel, mantendo `sslmode=require` e demais parâmetros. Não desativar validação TLS para contornar falha.
3. Guardar a conexão somente em `DATABASE_URL` no Render. Não adicionar a conexão ao Next, ao Git, à descrição do PR ou aos logs. Para esta primeira instância usar a conexão direta, compatível com a execução de migrations no start; avaliar pooling separadamente se houver mais instâncias.

## Render: API

Importar `render.yaml` da raiz do repositório com a branch de entrega já revisada. Não usar `apps/api` como Root Directory: o build precisa do lockfile raiz e de `packages/contracts`. O Blueprint usa plano free e deploy automático desligado; a criação inicial ainda dispara um deploy, portanto só importar após liberar a migration e configurar as variáveis.

| Variável             | Valor no host                                       |
| -------------------- | --------------------------------------------------- |
| `NODE_VERSION`       | `24`                                                |
| `NODE_ENV`           | `production`                                        |
| `HOST`               | `0.0.0.0`                                           |
| `PORT`               | Fornecida pelo Render; não fixar                    |
| `DATABASE_URL`       | Conexão TLS do Neon                                 |
| `BETTER_AUTH_SECRET` | Gerado pelo Blueprint; manter estável entre deploys |
| `BETTER_AUTH_URL`    | `https://<api>.onrender.com`                        |
| `WEB_ORIGIN`         | `https://<web>.vercel.app` ou domínio definitivo    |

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
