"use client";

import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Author, Tag, Category } from "@/lib/wordpress.d";

interface FilterPostsProps {
  authors: Author[];
  tags: Tag[];
  categories: Category[];
  selectedAuthor?: string;
  selectedTag?: string;
  selectedCategory?: string;
}

export function FilterPosts({
  authors,
  tags,
  categories,
  selectedAuthor,
  selectedTag,
  selectedCategory,
}: FilterPostsProps) {
  const router = useRouter();
  const t = useTranslations("Posts");

  const handleFilterChange = (type: string, value: string) => {
    const newParams = new URLSearchParams(window.location.search);
    newParams.delete("page");
    newParams.delete("search"); // Clear search when changing filters
    value === "all" ? newParams.delete(type) : newParams.set(type, value);

    router.push(`/blog?${newParams.toString()}`);
  };

  const handleResetFilters = () => {
    router.push("/blog");
  };

  const hasTags = tags.length > 0;
  const hasCategories = categories.length > 0;
  const hasAuthors = authors.length > 0;

  return (
    <div className="grid md:grid-cols-[1fr_1fr_1fr_0.5fr] gap-2 my-4 z-10!">
      <Select
        value={selectedTag || "all"}
        onValueChange={(value) => handleFilterChange("tag", value)}
      >
        <SelectTrigger disabled={!hasTags}>
          {hasTags ? <SelectValue placeholder={t("allTags")} /> : t("noTags")}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("allTags")}</SelectItem>
          {tags.map((tag) => (
            <SelectItem key={tag.id} value={tag.id.toString()}>
              {tag.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedCategory || "all"}
        onValueChange={(value) => handleFilterChange("category", value)}
      >
        <SelectTrigger disabled={!hasCategories}>
          {hasCategories ? (
            <SelectValue placeholder={t("allCategories")} />
          ) : (
            t("noCategories")
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("allCategories")}</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id.toString()}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedAuthor || "all"}
        onValueChange={(value) => handleFilterChange("author", value)}
      >
        <SelectTrigger disabled={!hasAuthors} className="text-center">
          {hasAuthors ? (
            <SelectValue placeholder={t("allAuthors")} />
          ) : (
            t("noAuthors")
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("allAuthors")}</SelectItem>
          {authors.map((author) => (
            <SelectItem key={author.id} value={author.id.toString()}>
              {author.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="outline" onClick={handleResetFilters}>
        {t("resetFilters")}
      </Button>
    </div>
  );
}
