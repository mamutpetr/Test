import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "./i18n/config";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split("/")[1];
  if (isLocale(first)) return NextResponse.next();
  const pref = req.cookies.get("locale")?.value;
  const accept = req.headers.get("accept-language") ?? "";
  const locale = isLocale(pref) ? pref : /^en\b/i.test(accept) && !/uk|ru/i.test(accept.split(",")[0] ?? "") ? "en" : DEFAULT_LOCALE;
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except API, admin, Next internals and static files.
  matcher: ["/((?!api|admin|_next|favicon|icon|apple-icon|manifest|sitemap|robots|sw\\.js|.*\\..*).*)"],
};
