import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

import {
  getProducts,
  getAllProductCategories,
  getAllProductTags,
  getProductCategoryBySlug,
  getProductTagBySlug,
} from "@/lib/woocommerce";

import { localizeProducts } from "@/lib/i18n-content";
import { Section, Container, Prose } from "@/components/craft";
import { ProductGrid, ProductFilters, MobileFilters } from "@/components/shop";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export async function generateMetadata({
  params,
}: Pick<ShopPageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Shop" });

  return {
    title: t("title"),
    description: t("metaDescription"),
  };
}

export const dynamic = "auto";
export const revalidate = 600;

interface ShopPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string;
    category?: string;
    tag?: string;
    search?: string;
    sort?: string;
    min_price?: string;
    max_price?: string;
  }>;
}

export default async function ShopPage({
  params: routeParams,
  searchParams,
}: ShopPageProps) {
  const { locale } = await routeParams;
  setRequestLocale(locale as Locale);
  const [t, tc] = await Promise.all([
    getTranslations("Shop"),
    getTranslations("Common"),
  ]);
  const params = await searchParams;
  const {
    page: pageParam,
    category,
    tag,
    search,
    sort,
    min_price,
    max_price,
  } = params;

  const page = pageParam ? parseInt(pageParam, 10) : 1;
  const productsPerPage = 12;

  // Parse sort parameter
  let orderby: "date" | "price" | "popularity" | "rating" | undefined;
  let order: "asc" | "desc" | undefined;

  switch (sort) {
    case "popularity":
      orderby = "popularity";
      break;
    case "rating":
      orderby = "rating";
      break;
    case "date":
      orderby = "date";
      order = "desc";
      break;
    case "price":
      orderby = "price";
      order = "asc";
      break;
    case "price-desc":
      orderby = "price";
      order = "desc";
      break;
  }

  // Resolve category and tag slugs to IDs
  const [categoryData, tagData] = await Promise.all([
    category ? getProductCategoryBySlug(category) : undefined,
    tag ? getProductTagBySlug(tag) : undefined,
  ]);

  // Fetch products and filter options
  const [productsResponse, categories, tags] = await Promise.all([
    getProducts(page, productsPerPage, {
      category: categoryData?.id,
      tag: tagData?.id,
      search,
      orderby,
      order,
      min_price: min_price ? parseFloat(min_price) : undefined,
      max_price: max_price ? parseFloat(max_price) : undefined,
    }),
    getAllProductCategories(),
    getAllProductTags(),
  ]);

  const products = localizeProducts(productsResponse.data, locale);
  const { headers } = productsResponse;
  const { total, totalPages } = headers;

  // Create pagination URL helper
  const createPaginationUrl = (newPage: number) => {
    const urlParams = new URLSearchParams();
    if (newPage > 1) urlParams.set("page", newPage.toString());
    if (category) urlParams.set("category", category);
    if (tag) urlParams.set("tag", tag);
    if (search) urlParams.set("search", search);
    if (sort) urlParams.set("sort", sort);
    if (min_price) urlParams.set("min_price", min_price);
    if (max_price) urlParams.set("max_price", max_price);
    return `/shop${urlParams.toString() ? `?${urlParams.toString()}` : ""}`;
  };

  const pageTitle = categoryData?.name || t("title");

  const filterProps = {
    categories,
    tags,
    currentCategory: category,
    currentTag: tag,
    currentSearch: search,
    currentSort: sort,
    currentMinPrice: min_price,
    currentMaxPrice: max_price,
  };

  return (
    <Section>
      <Container>
        <div className="space-y-8">
          <Prose className="max-w-2xl">
            <h1>{pageTitle}</h1>
            {!categoryData && <p className="text-lg">{t("intro")}</p>}
            <p className="text-muted-foreground">
              {t("productsFound", { count: total })}
              {search && ` ${t("matching", { search })}`}
            </p>
          </Prose>

          <div className="grid lg:grid-cols-[280px_1fr] gap-8">
            {/* Filters: sidebar on desktop, on-demand sheet below lg */}
            <aside className="hidden lg:block space-y-6">
              <ProductFilters {...filterProps} />
            </aside>
            <div className="lg:hidden">
              <MobileFilters {...filterProps} />
            </div>

            {/* Product Grid */}
            <div className="space-y-8">
              <ProductGrid products={products} columns={3} />

              {totalPages > 1 && (
                <div className="flex justify-center items-center py-8">
                  <Pagination>
                    <PaginationContent>
                      {page > 1 && (
                        <PaginationItem>
                          <PaginationPrevious
                            href={createPaginationUrl(page - 1)}
                            label={tc("previous")}
                            aria-label={tc("previousPage")}
                          />
                        </PaginationItem>
                      )}

                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((pageNum) => {
                          return (
                            pageNum === 1 ||
                            pageNum === totalPages ||
                            Math.abs(pageNum - page) <= 1
                          );
                        })
                        .map((pageNum, index, array) => {
                          const showEllipsis =
                            index > 0 && pageNum - array[index - 1] > 1;
                          return (
                            <div key={pageNum} className="flex items-center">
                              {showEllipsis && <span className="px-2">...</span>}
                              <PaginationItem>
                                <PaginationLink
                                  href={createPaginationUrl(pageNum)}
                                  isActive={pageNum === page}
                                >
                                  {pageNum}
                                </PaginationLink>
                              </PaginationItem>
                            </div>
                          );
                        })}

                      {page < totalPages && (
                        <PaginationItem>
                          <PaginationNext
                            href={createPaginationUrl(page + 1)}
                            label={tc("next")}
                            aria-label={tc("nextPage")}
                          />
                        </PaginationItem>
                      )}
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
