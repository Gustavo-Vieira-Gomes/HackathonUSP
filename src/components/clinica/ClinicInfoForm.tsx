"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { saveClinicInfo } from "@/lib/actions";
import { useToast } from "./Toast";

type Info = { name: string; address: string; openingHours: string };

/** Edição do perfil da clínica: nome, endereço e horário de funcionamento. */
export function ClinicInfoForm({ initial }: { initial: Info }) {
  const toast = useToast();
  const [form, setForm] = useState<Info>(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const changed = form.name !== initial.name || form.address !== initial.address || form.openingHours !== initial.openingHours;

  function set<K extends keyof Info>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setError("");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveClinicInfo(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.show("Informações salvas. O perfil já mostra os dados novos.");
    });
  }

  return (
    <form className="card" onSubmit={submit} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="field">
        <label htmlFor="cl-nome">Nome da clínica</label>
        <input id="cl-nome" className="input" value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="organization" />
      </div>
      <div className="field">
        <label htmlFor="cl-end">Endereço</label>
        <input id="cl-end" className="input" value={form.address} onChange={(e) => set("address", e.target.value)} autoComplete="street-address" />
        <span className="help">Rua, número e bairro, como o paciente vai procurar no mapa.</span>
      </div>
      <div className="field">
        <label htmlFor="cl-hor">Horário de funcionamento</label>
        <input id="cl-hor" className="input" value={form.openingHours} onChange={(e) => set("openingHours", e.target.value)} />
        <span className="help">Por exemplo: Seg a sex, 7h às 22h · Sáb, 8h às 14h.</span>
      </div>
      {error ? (
        <span role="alert" className="help err">
          {error}
        </span>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
        <Link href="/clinica" className="btn btn-ghost">
          Voltar ao painel
        </Link>
        <button type="submit" className="btn btn-primary" disabled={pending || !changed}>
          {pending ? "Salvando…" : "Salvar informações"}
        </button>
      </div>
      {toast.node}
    </form>
  );
}
