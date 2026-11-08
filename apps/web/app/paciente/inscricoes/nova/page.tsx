import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/core/shared/services/session.service';
import { SubscriptionForm } from '@/core/modules/patient/components/subscription-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Entrar na lista de encaixe' };

export default async function NewSubscriptionPage() {
  const user = await getSessionUser((await cookies()).toString());
  if (!user) redirect('/paciente/login');
  if (user.role !== 'paciente') redirect('/clinica');
  return <SubscriptionForm />;
}
