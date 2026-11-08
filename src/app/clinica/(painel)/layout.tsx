import { ClinicNav } from "@/components/ClinicNav";
import { getClinic, getGoogleConnection } from "@/lib/data";
import "../clinica.css";

// Painel da clínica: barra escura no topo e conteúdo até 1280 px, como no design.
export default async function ClinicaLayout({ children }: { children: React.ReactNode }) {
  const [clinic, google] = await Promise.all([getClinic(), getGoogleConnection()]);
  const connected = google?.connected ? 1 : 0;
  return (
    <div className="vc" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <ClinicNav clinicName={clinic.name} connectedLabel={connected ? "Google Agenda conectada" : "Agenda própria do remark"} />
      {children}
    </div>
  );
}
