"use client";

import { useEffect, useRef, useState } from "react";

/** Link de recurso ainda não feito: avisa "Esta feature está a caminho" no lugar. */
export function ComingSoonLink({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <>
      <button
        type="button"
        className={className ?? "link-btn"}
        style={style}
        onClick={() => {
          setOpen(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setOpen(false), 3000);
        }}
      >
        {children}
      </button>
      {open && (
        <div className="toast rise" role="status" aria-live="polite">
          Esta feature está a caminho
        </div>
      )}
    </>
  );
}
