import Image from "next/image";

import type { DestinationImage } from "@/lib/woocommerce.d";
import { cn } from "@/lib/utils";

/**
 * Image gallery under the experiences: the first image is the large one,
 * the others fill a tight grid around it.
 */
export function DestinationGallery({
  images,
  title,
  name,
}: {
  images: DestinationImage[];
  title: string;
  /** Country name, used as alt text fallback. */
  name: string;
}) {
  if (images.length === 0) return null;

  const single = images.length === 1;

  return (
    <section aria-label={title}>
      <ul
        className={cn(
          "grid gap-2 sm:gap-3",
          single
            ? "grid-cols-1"
            : "auto-rows-[9rem] grid-cols-2 sm:auto-rows-[11rem] md:auto-rows-[13rem] md:grid-cols-4",
        )}
      >
        {images.map((image, i) => (
          <li
            key={image.id}
            className={cn(
              "group relative overflow-hidden rounded-md bg-muted",
              single && "aspect-[21/9]",
              !single && i === 0 && "col-span-2 row-span-2",
            )}
          >
            <Image
              src={image.src}
              alt={image.alt || image.caption || name}
              fill
              sizes={i === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"}
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
            {image.caption && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 text-xs text-white">
                {image.caption}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
