# Verificação

- Check integrado ao main f59b350: 353 testes API, 52 web, 20 contratos; zero falhas. Lint, tipos e formatação verdes.
- Build e smoke HTTP verdes; smoke comprova `/clinica` com API desligada respondendo 200 e a mensagem de falha de perfil.
- HACK-50: Better Auth + Postgres local; senha válida recupera mesma identidade, senha errada/paciente/perfil completo não sobrescrevem. Falha na recuperação não apaga a conta.
- HACK-51: 401, 403, perfil ausente, 500, corpo inválido, timeout e rede cobertos pelos testes de serviço/painel.
- HACK-52: teste por correção: TUSS, PUT sem questionário sem escrita, edição com 90 minutos, navegação 401/403 e 404 de configurações.
- Geocodificação e fornecedores externos simulados; não houve validação de fornecedor real, deploy ou credenciais externas.
