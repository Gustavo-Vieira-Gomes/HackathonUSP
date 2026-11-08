import type { Metadata } from 'next';
import { WhatsappDemoScreen } from '@/core/modules/demo-whatsapp/screens/whatsapp-demo-screen';
import { getSimulatedWhatsappMessages } from '@/core/modules/demo-whatsapp/services/whatsapp-demo.server.service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'WhatsApp simulado · Demonstração',
  robots: { index: false, follow: false },
};

export default async function WhatsappDemoPage() {
  return <WhatsappDemoScreen result={await getSimulatedWhatsappMessages()} />;
}
