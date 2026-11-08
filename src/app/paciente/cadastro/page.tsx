import type { Metadata } from "next";
import { SignupForm } from "./SignupForm";
import "./cadastro.css";

export const metadata: Metadata = { title: "Criar conta · remark" };

export default function CadastroPage() {
  return <SignupForm />;
}
