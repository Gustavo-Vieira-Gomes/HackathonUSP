import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { WhatsappDemoScreen } from '@/core/modules/demo-whatsapp/screens/whatsapp-demo-screen';
import { getSimulatedWhatsappMessages } from '@/core/modules/demo-whatsapp/services/whatsapp-demo.server.service';
import { checkDemoAccess } from '@/core/shared/lib/demo-access';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'WhatsApp simulado · Demonstração',
  robots: { index: false, follow: false },
};

export default async function WhatsappDemoPage() {
  // Segunda camada além do proxy.ts: sem credencial do operador, nada é buscado.
  const authorization = (await headers()).get('authorization');
  if (checkDemoAccess(authorization) !== 'ok') notFound();
  return <WhatsappDemoScreen result={await getSimulatedWhatsappMessages()} />;
}
