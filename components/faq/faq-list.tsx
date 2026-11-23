import { Plus } from "lucide-react";

import { Prose } from "@/components/craft";
import type { Faq } from "@/lib/faq";
import { cn } from "@/lib/utils";

/**
 * FAQ accordion on native <details>: no client JS, answers stay in the HTML
 * (crawlable, find-in-page works). Also emits FAQPage structured data.
 */
export function FaqList({
  faqs,
  structuredData = true,
  className,
}: {
  faqs: Faq[];
  /** Emit schema.org FAQPage JSON-LD (only one per page) */
  structuredData?: boolean;
  className?: string;
}) {
  if (faqs.length === 0) return null;

  return (
    <div className={cn("border-t border-foreground/20", className)}>
      {faqs.map((faq) => (
        <details
          key={faq.id}
          className="group border-b border-foreground/20"
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-left text-lg font-medium transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
            <span>{faq.question}</span>
            <Plus
              aria-hidden
              className="mt-1 size-5 shrink-0 text-primary transition-transform duration-200 group-open:rotate-45"
            />
          </summary>
          <Prose
            className="max-w-none pb-6 pr-11 text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: faq.answer }}
          />
        </details>
      ))}

      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: faqJsonLd(faqs) }}
        />
      )}
    </div>
  );
}

function faqJsonLd(faqs: Faq[]): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
  // "<" escaped so answer HTML can't close the script tag
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
