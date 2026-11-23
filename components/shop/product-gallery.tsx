"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import type { ProductImage } from "@/lib/woocommerce.d";
import { cn } from "@/lib/utils";
import { ProductImageFallback } from "./product-image-fallback";

interface ProductGalleryProps {
  images: ProductImage[];
  productName: string;
  /** Picks the colour of the stand-in panel when there are no images */
  categorySlugs?: string[];
}

export function ProductGallery({ images, productName, categorySlugs = [] }: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const t = useTranslations("Product");

  if (!images || images.length === 0) {
    return (
      <div className="aspect-[4/3] overflow-hidden rounded-lg">
        <ProductImageFallback categorySlugs={categorySlugs} />
      </div>
    );
  }

  const selectedImage = images[selectedIndex];

  return (
    <div className="flex flex-col gap-4">
      {/* Main Image */}
      <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
        <Image
          src={selectedImage.src}
          alt={selectedImage.alt || productName}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
        />
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {images.map((image, index) => (
            <button
              key={image.id}
              onClick={() => setSelectedIndex(index)}
              className={cn(
                "relative w-20 h-20 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all",
                selectedIndex === index
                  ? "border-primary"
                  : "border-transparent hover:border-muted-foreground/50"
              )}
            >
              <Image
                src={image.src}
                alt={
                  image.alt ||
                  t("thumbnailAlt", { name: productName, index: index + 1 })
                }
                fill
                className="object-cover"
                sizes="80px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
