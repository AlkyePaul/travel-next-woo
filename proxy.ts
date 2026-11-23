import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Redirects locale-less URLs (e.g. "/shop") to the visitor's locale,
// detected from the NEXT_LOCALE cookie, then Accept-Language, then the default.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, Vercel internals and any file with an extension
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
