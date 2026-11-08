import "./payment-loading.css";

// Carregamento entre «Pagar»/«Confirmar reserva» e a reserva confirmada:
// a bolinha desce os degraus da escada de preço, a assinatura visual do remark.
export function PaymentLoading({ title = "Confirmando o pagamento", detail = "Estamos garantindo o seu horário com a clínica." }: { title?: string; detail?: string }) {
  return (
    <div className="pay-loading" role="status" aria-live="polite">
      <div className="pay-stage" aria-hidden="true">
        <span className="pay-step s1" />
        <span className="pay-step s2" />
        <span className="pay-step s3" />
        <span className="pay-step s4" />
        <span className="pay-ball" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
        <strong className="disp" style={{ fontSize: 22 }}>
          {title}
          <span className="pay-dots" aria-hidden="true">
            <i>.</i>
            <i>.</i>
            <i>.</i>
          </span>
        </strong>
        <span className="small" style={{ color: "#c9e6e0", maxWidth: "28ch" }}>
          {detail}
        </span>
      </div>
    </div>
  );
}
