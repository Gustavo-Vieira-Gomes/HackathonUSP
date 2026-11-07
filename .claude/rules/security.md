# Segurança por padrão

- Validar formato/tamanho de body, query, params e respostas externas. Validar permissões por recurso no servidor; esconder botão não é autorização.
- Não implementar criptografia ou sessão próprias. Escolher autenticação conforme produto; enquanto não existe, não declarar rotas protegidas.
- Segredos em .env local ignorado ou provedor de segredos. Exemplos contêm só placeholders. Variáveis públicas são públicas no bundle.
- Não registrar senhas, tokens, cookies, dados pessoais completos ou payloads sensíveis. Minimizar coleta.
- Consultas parametrizadas, uploads com limites e tipo verificado, URLs externas controladas para evitar SSRF, conteúdo HTML externo sanitizado quando necessário.
- CORS não substitui autenticação. Para cookies, considerar CSRF, SameSite, Secure e HttpOnly conforme fluxo.
- Rate limits, assinatura de webhook, isolamento por tenant e auditoria entram quando o fluxo que os exige for criado; não fingir que o scaffold já os fornece.
- Erros de configuração interrompem inicialização; indisponibilidade não retorna sucesso falso.
