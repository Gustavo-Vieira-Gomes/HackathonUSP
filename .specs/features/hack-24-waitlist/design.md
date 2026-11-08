# Desenho

Nest possui inscrições e expiração; contratos Zod validam fronteiras; Next coordena formulário e renderiza resultado. Reutilizar PatientGuard, MatchingService, ClockService, EmailService e proxy/session existentes. Sem camada nova de domínio. E-mail expirado requer marcador persistente para evitar repetição em todo cron; renovar limpa marcador. Falha do fornecedor não vira sucesso fictício.
