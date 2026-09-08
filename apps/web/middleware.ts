import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/signup", "/api/", "/_next", "/favicon.ico"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const token = req.cookies.get("regressa_session")?.value;
  // Signature is verified server-side in getCtx(); the middleware only short-circuits obvious anonymous requests.
  if (!token) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
