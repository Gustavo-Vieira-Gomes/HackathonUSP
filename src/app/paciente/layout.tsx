import "./phone.css";

// O app do paciente é mobile: no desktop aparece dentro de uma moldura de 390 × 844, como no design.
export default function PacienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="phone-stage">
      <div className="phone">{children}</div>
    </div>
  );
}
