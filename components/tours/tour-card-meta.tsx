import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";

import type { Tour } from "@/lib/woocommerce.d";
import { useDurationLabel } from "./tour-details";

/** Kind and duration line on product cards. */
export function TourCardMeta({ tour }: { tour: Tour }) {
  const t = useTranslations("Tour");
  const duration = useDurationLabel(tour);

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="whitespace-nowrap">{t("kind", { kind: tour.kind })}</span>
      {duration && (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Clock className="h-3 w-3" />
          {duration}
        </span>
      )}
    </p>
  );
}
