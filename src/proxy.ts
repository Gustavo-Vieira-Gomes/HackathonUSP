import { NextResponse, type NextRequest } from "next/server";
import { CLINIC_AUTH_COOKIE, PATIENT_AUTH_COOKIE } from "./lib/auth-cookies";

// Login simulado: sem o cookie de "entrou", a área manda para a tela de login e volta depois.
const PUBLIC = ["/paciente/entrar", "/paciente/cadastro", "/clinica/entrar"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  const area = pathname.startsWith("/clinica") ? "/clinica" : "/paciente";
  const cookie = area === "/clinica" ? CLINIC_AUTH_COOKIE : PATIENT_AUTH_COOKIE;
  if (request.cookies.get(cookie)?.value === "1") return NextResponse.next();

  const login = new URL(`${area}/entrar`, request.url);
  if (pathname !== area) login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/paciente/:path*", "/clinica/:path*"],
};
