"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconAlert } from "@/components/icons";

type ToastState = { msg: string; kind: "ok" | "error" } | null;

/** Aviso rápido no rodapé, como o `.toast` das pranchas. Some sozinho em 4 s. */
export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((msg: string, kind: "ok" | "error" = "ok") => {
    setToast({ msg, kind });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), kind === "error" ? 6000 : 4000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const node = toast ? (
    <div className="toast rise" role={toast.kind === "error" ? "alert" : "status"} key={toast.msg}>
      {toast.kind === "error" ? (
        <IconAlert style={{ color: "#ffb4a8" }} />
      ) : (
        <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "var(--amber)" }}>
          <path d="M5 12l5 5 9-10" />
        </svg>
      )}
      {toast.msg}
    </div>
  ) : null;

  return { show, node };
}
