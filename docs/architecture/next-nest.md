# Perfil Next + Nest (ativo)

## Responsabilidades

Next: interface, estado visual, autenticação da apresentação quando definida e adaptação para o navegador. Nest: validação de entrada, autorização, casos de uso, persistência e integrações. A sessão deve ter contrato verificado entre aplicações; não presumir que login no frontend protege a API.

## Evolução

Usar a arquitetura convencional do Nest: módulos por funcionalidade, controllers e serviços com @Injectable() e injeção por construtor. Aproveitar pipes, guards, interceptors, filtros e providers conforme o fluxo exigir. Serviços podem acessar o ORM e fornecedores diretamente; extrair colaboração adicional quando houver complexidade ou reutilização real. Não exigir Clean Architecture, arquitetura hexagonal, interfaces para toda dependência ou uma classe por caso de uso. A eventual migração para Next será adaptada no momento da decisão, sem limitar os recursos do Nest agora. Next consulta API por módulos de servidor (`server-only`); não expor API_BASE_URL nem credenciais ao cliente. Acesso browser direto à API só se requisito justificar contrato público e CORS explícito.

## Operação

`npm run dev` executa as duas aplicações. Web: 3000; API: 3001, prefixo /api. Cada aplicação tem .env.example; o Next lê seu .env.local. A API carrega seu .env local na inicialização com o suporte nativo do Node; variáveis já definidas no processo têm precedência. Defaults locais não exigem arquivo.

Sem banco ou autenticação até definir o produto. Endpoints /api/health provam liveness, não prontidão de dependências futuras.
