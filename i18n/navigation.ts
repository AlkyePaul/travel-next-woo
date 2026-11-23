import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware replacements for next/link and next/navigation.
// Use these for internal links so the current locale is kept in the URL.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
