import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

import {
  getProducts,
  getProductCategoryBySlug,
  getAllCategorySlugs,
} from "@/lib/woocommerce";

import { localizeProducts } from "@/lib/i18n-content";
import { Section, Container, Prose } from "@/components/craft";
import { ProductGrid } from "@/components/shop";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface CategoryPageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllCategorySlugs();
  return slugs;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const [t, category] = await Promise.all([
    getTranslations({ locale: locale as Locale, namespace: "Shop" }),
    getProductCategoryBySlug(slug),
  ]);

  if (!category) {
    return {
      title: t("categoryNotFound"),
    };
  }

  return {
    title: category.name,
    description:
      category.description || t("categoryDescription", { name: category.name }),
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const { page: pageParam } = await searchParams;
  const [t, tNav, tc] = await Promise.all([
    getTranslations("Shop"),
    getTranslations("Nav"),
    getTranslations("Common"),
  ]);

  const category = await getProductCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const page = pageParam ? parseInt(pageParam, 10) : 1;
  const productsPerPage = 12;

  const productsResponse = await getProducts(page, productsPerPage, {
    category: category.id,
  });
  const products = localizeProducts(productsResponse.data, locale);
  const { headers } = productsResponse;

  const { total, totalPages } = headers;

  const createPaginationUrl = (newPage: number) => {
    const urlParams = new URLSearchParams();
    if (newPage > 1) urlParams.set("page", newPage.toString());
    return `/shop/category/${slug}${urlParams.toString() ? `?${urlParams.toString()}` : ""}`;
  };

  return (
    <Section>
      <Container>
        <div className="space-y-8">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/shop" className="hover:text-foreground">
              {tNav("shop")}
            </Link>
            <span>/</span>
            <span className="text-foreground">{category.name}</span>
          </nav>

          <Prose>
            <h1>{category.name}</h1>
            <p className="text-muted-foreground">
              {t("productCount", { count: total })}
            </p>
          </Prose>

          {/* Category Image */}
          {category.image && (
            <div className="w-full h-48 rounded-lg overflow-hidden bg-muted">
              <img
                src={category.image.src}
                alt={category.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <ProductGrid products={products} columns={4} />

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
      </Container>
    </Section>
  );
}
