// middleware.ts
import { NextResponse, NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const authorized = request.cookies.get("authorized")?.value;
  const authenticated = request.cookies.get("publicKey")?.value;
  const url = request.nextUrl.clone();

  // Allow access to static files and the API
  if (
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/api") ||
    url.pathname === "/icon.png"
  ) {
    return NextResponse.next();
  }

  // Allow access to the landing page
  if (url.pathname.startsWith("/landing")) {
    return NextResponse.next();
  }

  // Redirect unauthorized users to the landing page
  if (!authorized) {
    url.pathname = "/landing";
    return NextResponse.redirect(url);
  }

  if (!authenticated && url.pathname === "/agents") {
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
