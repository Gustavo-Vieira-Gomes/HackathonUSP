// Ícones de traço do design (viewBox 24, classe .ico do vc.css).
import type { ReactNode } from "react";

function Ico({ children, size, className = "ico", style }: { children: ReactNode; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" style={size ? { width: size, height: size, ...style } : style}>
      {children}
    </svg>
  );
}

type P = { size?: number; style?: React.CSSProperties };

export const IconHome = (p: P) => <Ico {...p}><path d="M4 11l8-7 8 7v9H4z" /></Ico>;
export const IconCalendar = (p: P) => (
  <Ico {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Ico>
);
export const IconCalendarX = (p: P) => (
  <Ico {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4M10 13l4 4M14 13l-4 4" />
  </Ico>
);
export const IconAgenda = (p: P) => (
  <Ico {...p}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4M7 13h4M7 17h7" />
  </Ico>
);
export const IconDashboard = (p: P) => (
  <Ico {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Ico>
);
export const IconFlask = (p: P) => <Ico {...p}><path d="M9 3h6v6l4 10a2 2 0 0 1-2 3H7a2 2 0 0 1-2-3l4-10z" /></Ico>;
export const IconArrowRight = (p: P) => <Ico {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Ico>;
export const IconChevronRight = (p: P) => <Ico {...p}><path d="M9 6l6 6-6 6" /></Ico>;
export const IconChevronLeft = (p: P) => <Ico {...p}><path d="M15 5l-7 7 7 7" /></Ico>;
export const IconNext = (p: P) => <Ico {...p}><path d="M9 5l7 7-7 7" /></Ico>;
export const IconClose = (p: P) => <Ico {...p}><path d="M6 6l12 12M18 6L6 18" /></Ico>;
export const IconPlus = (p: P) => <Ico {...p}><path d="M12 5v14M5 12h14" /></Ico>;
export const IconCheck = (p: P) => <Ico {...p}><path d="M5 12l5 5 9-10" /></Ico>;
export const IconBell = (p: P) => (
  <Ico {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </Ico>
);
export const IconMoon = (p: P) => <Ico {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Ico>;
export const IconAlert = (p: P) => (
  <Ico {...p}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18v.5" />
  </Ico>
);
export const IconTarget = (p: P) => (
  <Ico {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.5" />
  </Ico>
);
export const IconLink = (p: P) => (
  <Ico {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Ico>
);
export const IconSync = (p: P) => (
  <Ico {...p}>
    <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
    <path d="M18 3v4h-4M6 21v-4h4" />
  </Ico>
);
export const IconUser = (p: P) => (
  <Ico {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Ico>
);
export const IconChat = (p: P) => (
  <Ico {...p}>
    <path d="M4 19.5l1.4-4.1A8 8 0 1 1 8.6 18.6z" />
    <path d="M9 10.5h6M9 13.5h4" />
  </Ico>
);
export const IconInfo = (p: P) => (
  <Ico {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.01" />
  </Ico>
);
export const IconPin = (p: P) => (
  <Ico {...p}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Ico>
);
export const IconClock = (p: P) => (
  <Ico {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Ico>
);
export const IconLogout = (p: P) => (
  <Ico {...p}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 16l-4-4 4-4M6 12h10" />
  </Ico>
);
export const IconPencil = (p: P) => (
  <Ico {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M14 6l4 4" />
  </Ico>
);

// Marca remark: grade 3×3 (arquivos em public/assets/).
const GRID_ON_DARK = ["#2a7f75", "#f7fbfa", "#2a7f75", "#f7fbfa", "#f7fbfa", "#5cc8b0", "#2a7f75", "#f7fbfa", "#2a7f75"];

/** Ícone do app remark: quadrado escuro arredondado com a grade. Serve em fundo claro. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <rect width="1024" height="1024" rx="256" fill="#17363a" />
      <g transform="translate(244.5 244.5) scale(9.553571428571429)">
        {GRID_ON_DARK.map((fill, i) => (
          <rect key={i} x={(i % 3) * 20} y={Math.floor(i / 3) * 20} width="16" height="16" rx="4" fill={fill} />
        ))}
      </g>
    </svg>
  );
}

/** Logo horizontal (símbolo + «remark»). `onDark` usa a versão reversa, para fundos escuros. */
export function Wordmark({ height = 30, tone = "onDark" }: { height?: number; tone?: "onDark" | "onLight" }) {
  const src = tone === "onDark" ? "/assets/remark-logo-reverso.svg" : "/assets/remark-logo.svg";
  // O SVG tem 422,4 × 112 e 12 px de respiro; a altura pedida é a do símbolo, sem o respiro.
  const h = Math.round((height * 112) / 88);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG estático da marca; next/image não ganha nada aqui
    <img src={src} alt="remark" height={h} width={Math.round((h * 422.4) / 112)} style={{ display: "block", margin: `-${Math.round((h * 12) / 112)}px` }} />
  );
}
