"use client";

import { ProductCategory } from "@prisma/client";
import { PRODUCT_CATEGORY_LABELS, PRODUCT_CATEGORY_PILL } from "@/lib/product-category";

export default function CategoryPill({ category }: { category: ProductCategory }) {
  const pill = PRODUCT_CATEGORY_PILL[category];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background: pill.bg,
        color: pill.color,
        border: `1px solid ${pill.border}`,
      }}
    >
      {PRODUCT_CATEGORY_LABELS[category]}
    </span>
  );
}
