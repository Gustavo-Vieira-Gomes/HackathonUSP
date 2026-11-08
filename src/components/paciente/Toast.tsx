"use client";

import { useEffect, useState } from "react";
import { IconCheck } from "@/components/icons";

/** Aviso rápido no rodapé; some sozinho. */
export function Toast({ message, ms = 4500 }: { message: string; ms?: number }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  if (!open) return null;
  return (
    <div className="toast rise" role="status" aria-live="polite">
      <IconCheck />
      {message}
    </div>
  );
}
