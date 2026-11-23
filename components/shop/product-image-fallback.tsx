import { Grape } from "lucide-react";

import { cn } from "@/lib/utils";
import { experienceCategories } from "@/menu.config";

// One palette colour per kind of experience: primary for cellars,
// secondary for vineyard days, accent for multi-day trips.
const tones: Record<string, string> = {
  [experienceCategories.hours]: "bg-primary",
  [experienceCategories.day]: "bg-secondary",
  [experienceCategories.days]: "bg-accent",
};

/** Stand-in for products without a photo. */
export function ProductImageFallback({
  categorySlugs,
  className,
}: {
  categorySlugs: string[];
  className?: string;
}) {
  const tone =
    categorySlugs.map((slug) => tones[slug]).find(Boolean) ?? tones[experienceCategories.day];

  return (
    <div
      aria-hidden
      className={cn(
        // `light`: same saturated panels in both themes
        "light flex h-full w-full items-center justify-center",
        // Vine rows: faint diagonal lines over the tone
        "bg-[repeating-linear-gradient(115deg,transparent_0_22px,rgb(255_255_255/0.05)_22px_24px)]",
        tone,
        className,
      )}
    >
      <Grape
        className="h-2/5 max-h-12 w-2/5 max-w-12 text-primary-foreground opacity-40"
        strokeWidth={1.25}
      />
    </div>
  );
}
