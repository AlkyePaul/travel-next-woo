// FAQ lists managed in WordPress by the "Next FAQ" plugin (plugin/next-faq).
//
// Two fixed lists: `home` (home page) and `product` (every product page).
// Italian lives in the native fields; other languages come in `i18n[locale]`
// (Next i18n plugin) and fall back to Italian field by field.
//
// Server-side only.

import { SOURCE_LOCALE } from "./i18n-content";

export type FaqList = "home" | "product";

export interface Faq {
  id: number;
  question: string;
  /** Sanitised HTML (wp_kses_post) */
  answer: string;
}

interface FaqResponse extends Faq {
  order: number;
  i18n?: Partial<Record<string, { question?: string; answer?: string }>>;
}

const baseUrl = process.env.WORDPRESS_URL;

/** Published FAQs of a list, in the dashboard order. [] if the plugin is unavailable. */
export async function getFaqs(list: FaqList, locale: string): Promise<Faq[]> {
  if (!baseUrl) return [];

  try {
    const response = await fetch(
      `${baseUrl}/wp-json/next-faq/v1/faqs?list=${list}`,
      { next: { tags: ["wordpress", "faqs", `faqs-${list}`], revalidate: 3600 } },
    );
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];

    return (data as FaqResponse[])
      .map(({ id, question, answer, i18n }) => {
        const translation = locale === SOURCE_LOCALE ? undefined : i18n?.[locale];
        return {
          id,
          question: translation?.question || question,
          answer: translation?.answer || answer,
        };
      })
      .filter((faq) => faq.question && faq.answer);
  } catch {
    console.warn(`next-faq list "${list}" unavailable`);
    return [];
  }
}
