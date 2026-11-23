"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ProductFilters, type ProductFiltersProps } from "./product-filters";

/** Mobile/tablet filters: a button that opens the filters in a bottom sheet. */
export function MobileFilters(props: ProductFiltersProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("Filters");
  const tc = useTranslations("Common");

  const activeCount = [
    props.currentCategory,
    props.currentTag,
    props.currentSearch,
    props.currentMinPrice || props.currentMaxPrice,
    props.currentSort,
  ].filter(Boolean).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full justify-center gap-2 bg-card">
          <SlidersHorizontal className="h-4 w-4" />
          {t("open")}
          {activeCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        closeLabel={tc("close")}
        className="flex max-h-[85dvh] flex-col gap-0 rounded-t-xl p-0"
      >
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            {t("open")}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <ProductFilters {...props} />
        </div>

        <div className="border-t px-6 py-4">
          <SheetClose asChild>
            <Button className="w-full">{t("showResults")}</Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
