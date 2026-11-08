import type { ReactNode } from "react";

/** Ícone de traço por tipo de exame do catálogo (chave do tipo: ressonancia, tomografia...). */
export function TypeIcon({ type, size = 22 }: { type: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    ressonancia: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="6" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    tomografia: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 4v4" />
      </>
    ),
    ultrassom: (
      <>
        <path d="M6 9a7 7 0 0 1 12 0" />
        <path d="M8.5 12a4 4 0 0 1 7 0" />
        <path d="M12 15v5" />
      </>
    ),
    mamografia: (
      <>
        <path d="M4 15a5 5 0 0 0 8 0 5 5 0 0 0 8 0" />
        <circle cx="8" cy="14" r="0.8" />
        <circle cx="16" cy="14" r="0.8" />
      </>
    ),
    ecocardiograma: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM7 12h3l1.5-2.5L13 14l1.5-2H17" />,
  };
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={{ width: size, height: size }}>
      {paths[type] ?? <circle cx="12" cy="12" r="7" />}
    </svg>
  );
}
