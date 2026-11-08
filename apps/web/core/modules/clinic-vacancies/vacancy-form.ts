/** Entradas do formulário são sempre hora local de São Paulo (UTC−3). */
export function vacancyFormBody(
  examId: string,
  startsAt: string,
  endsAt: string,
) {
  return {
    examId,
    startsAt: new Date(`${startsAt}:00-03:00`).toISOString(),
    endsAt: new Date(`${endsAt}:00-03:00`).toISOString(),
    reason: 'vazio' as const,
  };
}

export function vacancyErrorMessage(status: number, body: unknown): string {
  if (
    status >= 400 &&
    status < 500 &&
    body &&
    typeof body === 'object' &&
    'message' in body &&
    typeof body.message === 'string'
  )
    return body.message;
  return 'Não foi possível concluir agora. Tente novamente.';
}
