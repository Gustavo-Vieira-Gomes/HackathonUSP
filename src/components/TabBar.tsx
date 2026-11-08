"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCalendar, IconHome } from "./icons";

export function TabBar() {
  const path = usePathname();
  const onReservas = path.startsWith("/paciente/reservas");
  return (
    <nav className="tabbar" aria-label="Principal">
      <Link href="/paciente" className={onReservas ? undefined : "on"} aria-current={onReservas ? undefined : "page"}>
        <IconHome />
        Início
      </Link>
      <Link href="/paciente/reservas" className={onReservas ? "on" : undefined} aria-current={onReservas ? "page" : undefined}>
        <IconCalendar />
        Reservas
      </Link>
    </nav>
  );
}
