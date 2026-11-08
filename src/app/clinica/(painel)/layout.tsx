import { ClinicNav } from "@/components/ClinicNav";
import { ConfirmationTicker } from "@/components/clinica/ConfirmationTicker";
import { getClinic, getGoogleConnection } from "@/lib/data";
import "../clinica.css";

// Painel da clínica: barra escura no topo e conteúdo até 1280 px, como no design.
export default async function ClinicaLayout({ children }: { children: React.ReactNode }) {
  const [clinic, google] = await Promise.all([getClinic(), getGoogleConnection()]);
  return (
    <div className="vc" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <ClinicNav
        clinic={{
          name: clinic.name,
          address: clinic.address,
          openingHours: clinic.opening_hours,
          google: { connected: !!google?.connected, email: google?.account_email ?? null },
        }}
      />
      <ConfirmationTicker />
      {children}
    </div>
  );
}
