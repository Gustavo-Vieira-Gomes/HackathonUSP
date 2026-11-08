import { Suspense } from "react";
import { ClinicInfoForm } from "@/components/clinica/ClinicInfoForm";
import { WhatsAppSettings } from "@/components/clinica/WhatsAppSettings";
import { getClinic } from "@/lib/data";
import { whatsappStatus } from "@/lib/whatsapp/evolution";

export default function PerfilClinicaPage() {
  return (
    <main className="clinic-main" style={{ maxWidth: 760 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>Informações da clínica</h1>
        <span className="muted">O paciente vê esses dados na vaga, na reserva e no lembrete do exame.</span>
      </header>
      <Suspense fallback={<p className="muted">Carregando…</p>}>
        <Perfil />
      </Suspense>
    </main>
  );
}

async function Perfil() {
  const [clinic, wa] = await Promise.all([getClinic(), whatsappStatus(true)]);
  return (
    <>
      <ClinicInfoForm initial={{ name: clinic.name, address: clinic.address, openingHours: clinic.opening_hours }} />
      <WhatsAppSettings sendHours={clinic.confirm_send_hours} deadlineHours={clinic.confirm_deadline_hours} state={wa.state} />
    </>
  );
}
