# HACK-50, HACK-51 e HACK-52

Modo médio; design inline, sem mudança de arquitetura. RN-01, RN-02 e RN-37.

## Critérios

- HACK-50: repetir cadastro com senha correta recupera conta clínica sem perfil. Senha incorreta, paciente e clínica completa não podem ser sobrescritos.
- HACK-51: /clinica consulta só clinic/me; 401 leva ao login, falha/timeout mostra indisponibilidade, 403 nega acesso.
- HACK-52: TUSS compatível com protocolo; chave inexistente gera erro tratado; 90 minutos sobrevivem à edição; sessão expirada leva ao login e 404 de settings descreve clínica.

## Execução

1. Recuperação: sign-up.service, clinic-sign-up.service e testes HTTP; validar credencial real e ausência de sobrescrita.
2. Painel: clinic-panel, clinic-profile.service e testes; cobrir status e rede/timeout.
3. Exames: catálogo, exams.service, formulário e erros; regressões para cada um dos quatro casos.

Sem novas dependências. Verificação final: merge main atual, check, build e smoke HTTP.
