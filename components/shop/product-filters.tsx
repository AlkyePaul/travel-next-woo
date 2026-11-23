"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";

import type { ProductCategory, ProductTag } from "@/lib/woocommerce.d";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Lighter than the page background so the fields read as fillable.
const fieldClass = "bg-card";

export interface ProductFiltersProps {
  categories: ProductCategory[];
  tags: ProductTag[];
  currentCategory?: string;
  currentTag?: string;
  currentSearch?: string;
  currentSort?: string;
  currentMinPrice?: string;
  currentMaxPrice?: string;
}

export function ProductFilters({
  categories,
  tags,
  currentCategory,
  currentTag,
  currentSearch,
  currentSort,
  currentMinPrice,
  currentMaxPrice,
}: ProductFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("Filters");
  const tc = useTranslations("Common");

  const updateFilters = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });

      // Reset to page 1 when filters change
      params.delete("page");

      startTransition(() => {
        router.push(`/shop?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  // Debounce free-text fields so we don't navigate on every keystroke.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(debounceRef.current), []);
  const debouncedUpdate = (updates: Record<string, string | undefined>) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateFilters(updates), 400);
  };

  const clearFilters = () => {
    startTransition(() => {
      router.push("/shop");
    });
  };

  const hasActiveFilters =
    currentCategory ||
    currentTag ||
    currentSearch ||
    currentMinPrice ||
    currentMaxPrice;

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="space-y-2">
        <Label htmlFor="search">{t("search")}</Label>
        <Input
          id="search"
          type="search"
          placeholder={t("searchPlaceholder")}
          defaultValue={currentSearch}
          onChange={(e) =>
            debouncedUpdate({ search: e.target.value || undefined })
          }
          className={fieldClass}
        />
      </div>

      {/* Category */}
      {categories.length > 0 && (
        <div className="space-y-2">
          <Label>{t("category")}</Label>
          <Select
            value={currentCategory || "all"}
            onValueChange={(value) =>
              updateFilters({ category: value === "all" ? undefined : value })
            }
          >
            <SelectTrigger className={fieldClass}>
              <SelectValue placeholder={t("allCategories")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allCategories")}</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.slug}>
                  {category.name} ({category.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="space-y-2">
          <Label>{t("tag")}</Label>
          <Select
            value={currentTag || "all"}
            onValueChange={(value) =>
              updateFilters({ tag: value === "all" ? undefined : value })
            }
          >
            <SelectTrigger className={fieldClass}>
              <SelectValue placeholder={t("allTags")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allTags")}</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.slug}>
                  {tag.name} ({tag.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Sort */}
      <div className="space-y-2">
        <Label>{t("sortBy")}</Label>
        <Select
          value={currentSort || "default"}
          onValueChange={(value) =>
            updateFilters({ sort: value === "default" ? undefined : value })
          }
        >
          <SelectTrigger className={fieldClass}>
            <SelectValue placeholder={t("sort.default")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{t("sort.default")}</SelectItem>
            <SelectItem value="popularity">{t("sort.popularity")}</SelectItem>
            <SelectItem value="rating">{t("sort.rating")}</SelectItem>
            <SelectItem value="date">{t("sort.date")}</SelectItem>
            <SelectItem value="price">{t("sort.price")}</SelectItem>
            <SelectItem value="price-desc">{t("sort.priceDesc")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Price Range */}
      <div className="space-y-2">
        <Label>{t("priceRange")}</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder={t("min")}
            min={0}
            defaultValue={currentMinPrice}
            onChange={(e) => debouncedUpdate({ min_price: e.target.value || undefined })}
            className={fieldClass}
          />
          <Input
            type="number"
            placeholder={t("max")}
            min={0}
            defaultValue={currentMaxPrice}
            onChange={(e) => debouncedUpdate({ max_price: e.target.value || undefined })}
            className={fieldClass}
          />
        </div>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="outline"
          onClick={clearFilters}
          className="w-full"
          disabled={isPending}
        >
          {t("clear")}
        </Button>
      )}

      {isPending && (
        <div className="text-sm text-muted-foreground text-center">
          {tc("loading")}
        </div>
      )}
    </div>
  );
}
