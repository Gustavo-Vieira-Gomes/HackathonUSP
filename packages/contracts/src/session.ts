import { z } from 'zod';

/** Papel da conta. Uma conta tem um papel só (D2); quem fixa é a rota de cadastro. */
export const userRoleSchema = z.enum(['paciente', 'clinica']);

export type UserRole = z.infer<typeof userRoleSchema>;

/** Usuário da sessão devolvido por `GET /api/me`. */
export const sessionUserSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  role: userRoleSchema,
});

export type SessionUser = z.infer<typeof sessionUserSchema>;
