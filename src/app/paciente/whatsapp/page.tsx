import { Suspense } from "react";
import { getPatient, listPatientReservations, listWhatsAppMessages } from "@/lib/data";
import { currentPatientId } from "@/lib/session";
import { whatsappStatus } from "@/lib/whatsapp/evolution";
import { Screen, ScreenLoading, BackLink } from "@/components/paciente/Screen";
import { Logo } from "@/components/icons";
import { Chat } from "./Chat";
import "./whatsapp.css";

export default function WhatsAppPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <WhatsApp />
    </Suspense>
  );
}

async function WhatsApp() {
  const patientId = await currentPatientId();
  const [patient, messages, status, reservations] = await Promise.all([
    getPatient(patientId),
    listWhatsAppMessages(patientId),
    whatsappStatus(),
    listPatientReservations(patientId),
  ]);
  // Os botões de resposta rápida só aparecem enquanto há confirmação esperando resposta.
  const canAnswer = reservations.some((r) => r.confirmation === "pendente");
  const live = status.state === "conectado";

  return (
    <Screen
      className="scr-wa"
      style={{ padding: 0 }}
      header={
        <header className="wa-head">
          <BackLink href="/paciente" label="Voltar ao início" />
          <span className="wa-avatar" aria-hidden="true">
            <Logo size={26} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <strong style={{ fontSize: 16 }}>remark</strong>
            <span className="small" style={{ color: "#c9e6e0" }}>
              {live ? "WhatsApp conectado" : "WhatsApp simulado"}
            </span>
          </div>
        </header>
      }
    >
      <Chat
        messages={messages}
        canAnswer={canAnswer}
        note={
          live
            ? `As mensagens também chegam no WhatsApp do número ${patient?.phone ?? "cadastrado"}.`
            : "Simulação: sem número pareado na Evolution API, a conversa acontece aqui. Com o WhatsApp conectado, ela sai no celular do paciente."
        }
      />
    </Screen>
  );
}
