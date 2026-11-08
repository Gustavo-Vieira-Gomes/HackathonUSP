"use client";

import { useEffect, useRef, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { IconClose } from "@/components/icons";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal das pranchas: camada escura, cartão centralizado, Esc fecha,
 * foco preso dentro e devolvido a quem abriu.
 */
export function Dialog({
  labelledBy,
  onClose,
  onSubmit,
  width = 600,
  paddingTop = 80,
  style,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  width?: number;
  paddingTop?: number;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const boxRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const first = box?.querySelector<HTMLElement>("[data-autofocus]") ?? box?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !box) return;
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  const boxStyle: CSSProperties = {
    width,
    maxWidth: "100%",
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    ...style,
  };

  return (
    <div
      className="scrim"
      style={{ paddingTop }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {onSubmit ? (
        <form
          ref={(el) => {
            boxRef.current = el;
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          className="card"
          onSubmit={onSubmit}
          noValidate
          style={boxStyle}
        >
          {children}
        </form>
      ) : (
        <div
          ref={(el) => {
            boxRef.current = el;
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          className="card"
          style={boxStyle}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Cabeçalho dos diálogos: título, texto de apoio e o botão de fechar. */
export function DialogHeader({ id, title, children, onClose }: { id: string; title: string; children?: ReactNode; onClose: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 id={id} style={{ fontSize: 24 }}>
          {title}
        </h2>
        {children ? <p className="small muted">{children}</p> : null}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" aria-label="Fechar" style={{ width: 44, padding: 0, flex: "none" }} onClick={onClose}>
        <IconClose />
      </button>
    </div>
  );
}
