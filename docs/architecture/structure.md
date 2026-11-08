# Estrutura do projeto

## Decisão

Monorepo npm com aplicações separadas e organização por funcionalidade. No Nest, usar módulos, controllers, services, decorators e DI nativos. No Next, usar App Router e Server Components por padrão. Não criar camadas de arquitetura limpa ou hexagonal por obrigação.

Este documento define onde colocar o código ao desenvolver. As árvores abaixo são o desenho de evolução, não um inventário de arquivos já implementados. Criar pastas somente quando tiverem conteúdo real. `projects` é um exemplo de nome de funcionalidade, não um requisito do produto.

## Raiz

```text
HackathonUSP/
├── apps/
│   ├── web/                    # Next: interface e integração com API
│   └── api/                    # Nest: regras, persistência e integrações
├── packages/
│   └── contracts/              # Schemas e tipos de transporte compartilhados
├── scripts/                    # Automação do repositório; smoke HTTP já existe
├── docs/
│   ├── architecture/           # Perfil ativo, estrutura e migração
│   ├── rules/                  # Links de compatibilidade para as rules do Claude
│   └── templates/              # Modelos de planejamento
├── .specs/
│   ├── project/                # Objetivo, roadmap, decisões e pendências
│   └── features/<feature>/     # Critérios e passos de entregas maiores
├── .github/workflows/          # CI
├── .claude/rules/              # Fonte de verdade: globais e específicas por caminho
├── AGENTS.md                   # Índice das rules para os demais agentes
├── CLAUDE.md                   # Mapa das rules do Claude, sem import circular
├── package.json                # Workspaces e comandos coordenados
└── package-lock.json           # Lockfile único
```

Não criar pacotes `core`, `domain`, `utils` ou `ui` preventivamente. Só extrair outro pacote se houver consumidores reais e uma responsabilidade clara. Dependências de uma aplicação devem ser declaradas no package.json dela; ferramentas da raiz ficam na raiz. Mesmo com dependências hoisted, não depender implicitamente de uma biblioteca instalada por outro workspace.

## Frontend — apps/web

Organização inspirada na estrutura atual do Portal da Speedmilhas, conferida localmente: `app`, `core/modules` e `core/shared` na raiz da aplicação, sem `src`. O alias `@/` aponta para apps/web.

```text
apps/web/
├── public/                           # Imagens, ícones e arquivos públicos
├── app/                              # Rotas, layouts e arquivos especiais do Next
│   ├── layout.tsx                    # Layout raiz
│   ├── globals.css                   # Estilos globais e tokens visuais
│   ├── page.tsx                      # Compõe a tela de core/modules/initial-page
│   ├── api/health/route.ts            # Saúde do processo Next
│   └── projects/                     # Exemplo de segmento de URL
│       ├── page.tsx                  # Parâmetros, carregamento e composição da screen
│       ├── loading.tsx               # Quando necessário
│       ├── error.tsx                 # Quando necessário
│       └── [id]/page.tsx
└── core/
    ├── modules/
    │   ├── initial-page/
    │   │   └── screens/home-screen.tsx  # Tela inicial já existente
    │   └── projects/                 # Exemplo; substituir pelo domínio real
    │       ├── screens/              # Telas completas compostas pelas rotas
    │       ├── components/           # Formulários, listas e partes da funcionalidade
    │       ├── sections/             # Seções grandes de tela, se necessário
    │       ├── hooks/                # Hooks de interação e estado
    │       ├── services/             # Chamadas à API e mapeamento de respostas
    │       ├── actions/              # Server Actions para mutações, se necessárias
    │       ├── schemas/              # Validação específica de formulário
    │       ├── types/                # Tipos locais da interface
    │       ├── utils/                # Transformações específicas da funcionalidade
    │       ├── constants/            # Constantes e conteúdo estático
    │       ├── providers/            # Contextos React da funcionalidade, se necessários
    │       ├── store/                # Apenas se o fluxo exigir estado adicional
    │       └── test/                 # Testes e fixtures do módulo
    └── shared/
        ├── components/              # UI reutilizável: botão, input, modal
        ├── layouts/                 # Navegação e composição visual comuns
        ├── hooks/                   # Hooks usados por múltiplos módulos
        ├── services/                # Infraestrutura de chamadas compartilhada
        │   └── api-health.service.ts # Consulta de saúde já existente, server-only
        ├── config/                  # Configuração e validação de ambiente
        ├── constants/               # Constantes globais de apresentação
        ├── assets/                  # Assets importáveis; arquivos públicos ficam em public
        └── lib/                     # Integrações/utilitários técnicos compartilhados
```

### Regras de colocação

- `app` define navegação, metadados e layouts do Next. Páginas simples podem ser implementadas diretamente em `app/.../page.tsx`. Extrair uma screen para `core/modules/<feature>/screens` quando a composição da tela justificar; não criar uma screen por rota obrigatoriamente. Componentes menores específicos ficam em `components` do módulo. Não criar `pages/` dentro dos módulos como segunda convenção para screens.
- Criar apenas os diretórios usados. `schemas`, `types`, `utils`, `providers` e `store` são opcionais; a árvore não é uma lista de pastas obrigatórias por módulo.
- Um componente específico de projetos fica em `core/modules/projects/components`, mesmo usado em várias rotas de projetos. Só vai para `core/shared` quando for realmente reutilizável entre módulos.
- Route groups como `(public)` ou `(dashboard)` entram quando houver layouts distintos. Não aparecem na URL nem implementam autenticação por si só.
- Services do frontend fazem chamadas, validação de respostas e mapeamentos de apresentação. Regras e persistência continuam no Nest. Services que usam configuração/credenciais de servidor importam `server-only`; não importar esses arquivos em Client Components.
- Nomear módulos de servidor e cliente de forma explícita quando coexistirem, por exemplo `projects.server.service.ts` e `projects.client.service.ts`. Browser só chama endpoint público/proxy definido para isso; nunca acessa segredo ou endereço interno. Usar bibliotecas e mecanismos nativos sem criar um wrapper HTTP por obrigação.
- Actions usam `'use server'`, adaptam entradas, encaminham credenciais e revalidam a interface. Nest valida e autoriza suas próprias operações. Não criar Actions para consultas de Server Components nem endpoint interno para chamar o próprio Next via HTTP.
- Schemas públicos e tipos de transporte vêm de `@hackathon/contracts`. `schemas`/`types` do módulo são para formulários e estado visual; não duplicam os contratos. Diferentemente do Portal, não precisamos de um `core/contracts` adicional.
- Manter Server Components por padrão; hooks, providers e store só entram onde houver necessidade de interação/estado. Estado simples fica no componente e filtros compartilháveis na URL.
- Imports diretos são o padrão. `index.ts` é opcional para uma API pública útil; não criar barrels que misturem exports de servidor com componentes cliente. A importação suportada de uma Server Action não libera importar módulos server-only comuns.
- `core/shared` não significa camada de domínio nem independência de framework: é uma organização familiar para código reutilizado. Um helper começa no módulo; só extrair quando houver uso real em outros módulos.
- Não copiar peculiaridades operacionais do Portal (white-label, observabilidade ou workers específicos) sem requisito neste produto. Configurações Next, TS, lint e ambiente ficam na raiz de apps/web; arquivos globais `.d.ts` podem ficar em `types/` se surgirem.

## Backend — apps/api

```text
apps/api/
├── src/
│   ├── main.ts                 # Ambiente, bootstrap e listen
│   ├── app.ts                  # Factory da aplicação e configuração HTTP global
│   ├── app.module.ts           # Composição dos módulos
│   ├── app.test.ts             # Teste HTTP do bootstrap já existente
│   ├── health/                 # Liveness atual; pode continuar simples
│   │   └── health.controller.ts
│   ├── modules/
│   │   └── projects/           # Exemplo; substituir pelo domínio real
│   │       ├── projects.module.ts
│   │       ├── projects.controller.ts
│   │       ├── projects.service.ts
│   │       ├── projects.service.test.ts
│   │       ├── projects.http.test.ts
│   │       └── dto/            # Apenas DTOs/adaptações de validação realmente necessários
│   ├── common/                 # Mecânica HTTP reutilizada entre funcionalidades
│   │   ├── guards/
│   │   ├── pipes/
│   │   ├── filters/
│   │   ├── interceptors/
│   │   └── decorators/
│   ├── config/                 # Configuração validada e integrações de configuração
│   ├── database/               # Módulo/provider do ORM escolhido
│   └── integrations/
│       └── <provider>/        # Cliente/provider externo usado por vários módulos
└── <orm-config>/              # Schema, migrations e seed conforme ferramenta escolhida
```

### Regras de colocação

- Começar uma funcionalidade com module, controller e service. `@Injectable()` e DI por construtor são o padrão. Services podem usar ORM, exceções Nest e providers diretamente. Não exigir interfaces ou repositórios intermediários.
- Controllers tratam rotas, parâmetros e delegação. Services implementam regras e coordenam transações. Dividir um service quando tiver responsabilidades distintas reais; não criar uma classe por endpoint automaticamente.
- Módulos exportam somente os providers que outros módulos precisam. Consumidores importam o módulo e injetam o provider exportado; não instanciam services manualmente nem acessam controllers alheios.
- Recurso exclusivo de uma funcionalidade fica no módulo dela: guard, integração, tipo, helper ou regra. Só mover para `common`/`integrations` quando houver compartilhamento real. Não colocar regras de negócio em `common`.
- Autenticação, quando escolhida, fica em `modules/auth` com seus providers e guards. Permissões específicas de um recurso pertencem ao módulo responsável. Não criar uma implementação própria de autenticação antes de avaliar a solução pronta adequada.
- DTOs são fronteiras HTTP. Reutilizar os schemas Zod do pacote de contratos quando cobrirem o formato público; conectar a validação com um pipe Nest. Não manter schemas Zod e classes de validação equivalentes à mão. Se uma biblioteca exigir classes DTO, documentar a estratégia e manter uma fonte de verdade para o contrato.
- `database` configura e disponibiliza o ORM. Schema/migrations ficam no local convencional da ferramenta adotada, dentro de apps/api. Nada disso está escolhido ou implementado hoje. Models de persistência não viram automaticamente respostas HTTP.
- Jobs e WebSocket, se necessários, ficam no módulo da funcionalidade (`*.processor.ts`, `*.gateway.ts`), usando os recursos prontos da integração escolhida. Worker independente e fila só entram quando o requisito exigir.

## Contratos — packages/contracts

```text
packages/contracts/src/
├── index.ts                    # Exports públicos
├── health.ts                   # Extração futura do schema atual, se útil
└── projects.ts                # Exemplo: inputs, outputs e tipos inferidos da funcionalidade
```

Hoje o schema de saúde está diretamente em `index.ts`; não precisa ser movido para obedecer à árvore. Quando crescer, separar por funcionalidade e exportar pela entrada pública.

- Compartilhar formatos JSON e schemas de validação entre Next e Nest; inferir tipos TypeScript dos schemas.
- Não importar Nest, Next, ORM, ambiente, segredos ou código das aplicações. Código deste pacote pode chegar ao navegador.
- Regras de negócio e autorização continuam no Nest. Validação de formato no browser melhora UX; não substitui validação do servidor.
- Sem importações cruzadas entre apps. Direção permitida: web → contracts; api → contracts. Web conversa com API por HTTP.

## Testes e automação

- Na API, testes de regra e serviço ficam junto ao arquivo testado como `*.test.ts`. Testes HTTP da funcionalidade podem usar `*.http.test.ts`, fechando sempre a aplicação.
- O comando Nest compila com tsc e executa `.test-dist/**/*.test.js` (descoberta recursiva, um arquivo por vez por compartilhar o Postgres de teste); o de contratos procura `src/*.test.ts`. Antes de colocar testes de contratos em subpastas, atualizar o comando dele. Compilação Nest deve preservar os metadados de decorators. Helpers de teste da API ficam em `src/test-support/`, fora do build.
- No frontend, testes ficam em `core/modules/<feature>/test/` ou junto do recurso compartilhado em `core/shared`. O frontend ainda não tem runner de testes próprio. Ao criar testes de componentes, escolher/configurar o runner e adicioná-lo ao comando `check`; não apenas criar arquivos que ninguém executa.
- Testes completos de navegação, quando adotados, ficam em `apps/web/tests/e2e`, com configuração do runner nessa aplicação. Não pertencem a `app`, evitando rotas acidentais.
- Testes dos contratos ficam no próprio pacote. Fixtures ficam junto ao teste e não incluem dados pessoais ou credenciais reais.
- `scripts/smoke.mjs` verifica os builds por HTTP; scripts de uma aplicação ficam no `scripts/` dela. Scripts operacionais não substituem código de execução da aplicação.
- Configurações TS/lint/Next/Nest ficam na aplicação correspondente. Comandos coordenados e formatação comum ficam na raiz. `.env.example` pertence à aplicação; `.env` local nunca é versionado.

## Reuso e padrões

Os critérios normativos ficam em [design-patterns.md](../../.claude/rules/design-patterns.md): quando extrair, quem deve possuir a lógica, como migrar consumidores e quando usar Adapter, Strategy, Factory, Facade e Repository. Aplicar junto às rules de engenharia e às específicas de cada workspace; este guia descreve localização de arquivos.

## Nomes e crescimento

- Pastas e arquivos em inglês, com kebab-case. Componentes React usam PascalCase no código; arquivos podem ser `project-form.tsx`. Nest usa sufixos convencionais: `.module.ts`, `.controller.ts`, `.service.ts`, `.guard.ts`.
- Tipos locais ficam no arquivo que os usa. Criar `types.ts` na funcionalidade apenas se vários arquivos precisarem; contratos públicos pertencem ao pacote compartilhado.
- Uma utilidade começa junto ao consumidor. Extrair somente quando houver repetição ou responsabilidade separada clara. Evitar pastas genéricas `helpers`, `managers` ou `shared` sem critério de entrada.
- Documentação de setup e comandos fica no README; decisões e responsabilidades em docs/architecture; critérios/planos de entrega em .specs/features. Não copiar as mesmas políticas em múltiplos CLAUDE.md.

## Se ativarmos Next full stack

Manter rotas, features visuais e contratos. Adaptar os services Nest para `apps/web/core/server/modules/<feature>/`, usando os mecanismos do Next e acesso a dados no servidor. Infraestrutura compartilhada de servidor fica em `core/server/database`, `core/server/integrations` e `core/server/config`, conforme necessário. Rotas, Actions e páginas delegam a esses serviços; `core/modules` continua concentrando apresentação e chamadas.

Esse é um perfil alternativo: **não criar core/server de negócio enquanto Nest for o responsável**. A migração inclui adaptar decorators, DI, validação e autorização, atualizar scripts/CI e remover referências da API, conforme [next-fullstack.md](next-fullstack.md).
