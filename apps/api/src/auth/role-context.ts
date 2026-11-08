import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserRole } from '@hackathon/contracts';

/**
 * Papel fixado pela rota de cadastro durante a requisição. O hook de criação de
 * usuário do Better Auth lê daqui; fora das rotas de cadastro não há papel e a
 * criação é recusada.
 */
export const signUpRoleContext = new AsyncLocalStorage<UserRole>();
