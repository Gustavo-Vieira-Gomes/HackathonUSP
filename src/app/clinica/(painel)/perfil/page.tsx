import { Suspense } from "react";
import { ClinicInfoForm } from "@/components/clinica/ClinicInfoForm";
import { getClinic } from "@/lib/data";

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
  const clinic = await getClinic();
  return <ClinicInfoForm initial={{ name: clinic.name, address: clinic.address, openingHours: clinic.opening_hours }} />;
}
