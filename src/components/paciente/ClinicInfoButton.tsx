"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ClinicInfo } from "@/lib/data";
import { IconClock, IconClose, IconFlask, IconInfo, IconPin } from "@/components/icons";
import "./clinic-info.css";

const km = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km de você`;

/** «i» ao lado do nome da clínica: abre a ficha da clínica numa folha que sobe do rodapé. */
export function ClinicInfoButton({ clinic }: { clinic: ClinicInfo }) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<Element | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function show() {
    // A folha vai para dentro da moldura do celular (ou do body fora dela).
    setHost(button.current?.closest(".phone") ?? document.body);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  return (
    <>
      <button ref={button} type="button" className="ci-btn" onClick={show} aria-label={`Informações da ${clinic.name}`} aria-haspopup="dialog">
        <IconInfo />
      </button>
      {open && host
        ? createPortal(
            <div className="vc ci-layer">
              <div className="ci-scrim" onClick={close} aria-hidden="true" />
              <div className="ci-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <span className="ci-handle" aria-hidden="true" />
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <h2 id={titleId} style={{ fontSize: 22, lineHeight: 1.2 }}>
                      {clinic.name}
                    </h2>
                    <span className="small muted">Rede {clinic.agency_name}</span>
                  </div>
                  <button ref={closeRef} type="button" className="ci-close" onClick={close} aria-label="Fechar">
                    <IconClose />
                  </button>
                </div>

                <ul className="ci-list">
                  <li>
                    <span className="ci-ico">
                      <IconPin />
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <strong>{clinic.address}</strong>
                      <span className="small muted">{km(clinic.distance_km)}</span>
                    </span>
                  </li>
                  <li>
                    <span className="ci-ico">
                      <IconClock />
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <strong>{clinic.opening_hours}</strong>
                      <span className="small muted">Horário de funcionamento</span>
                    </span>
                  </li>
                  {clinic.exams.length > 0 ? (
                    <li>
                      <span className="ci-ico">
                        <IconFlask />
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                        <span className="small muted">Exames que a clínica faz pelo remark</span>
                        <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {clinic.exams.map((e) => (
                            <span key={e} className="ci-tag">
                              {e}
                            </span>
                          ))}
                        </span>
                      </span>
                    </li>
                  ) : null}
                </ul>

                <button type="button" className="btn btn-ghost btn-block" onClick={close}>
                  Voltar aos horários
                </button>
              </div>
            </div>,
            host,
          )
        : null}
    </>
  );
}
