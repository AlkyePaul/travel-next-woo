import { Fragment } from "react";
import { siteConfig } from "@/site.config";
import { cn } from "@/lib/utils";

/** Site name set in the display serif; an "&" in the name becomes an italic ampersand in the primary colour. */
export function Wordmark({
  className,
  ampersandClassName = "text-primary",
}: {
  className?: string;
  ampersandClassName?: string;
}) {
  const parts = siteConfig.site_name.split("&");

  return (
    <span
      className={cn(
        "font-display text-xl font-semibold leading-none whitespace-nowrap",
        className,
      )}
    >
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={cn("font-normal italic", ampersandClassName)}>&amp;</span>}
          {part}
        </Fragment>
      ))}
    </span>
  );
}
