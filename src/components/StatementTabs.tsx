"use client";

import { useState } from "react";
import type { StatementItem } from "@/lib/types";
import { ViewablePhoto } from "@/components/ui";

export function StatementTabs({ items, images }: { items: StatementItem[]; images: Record<number, string> }) {
  const [sel, setSel] = useState(items[0]?.categoryId);
  const s = items.find((i) => i.categoryId === sel) ?? items[0];
  if (!s) return null;
  return (
    <>
      <div className="tabs" role="tablist">
        {items.map((i) => (
          <button key={i.categoryId} type="button" role="tab" aria-selected={i.categoryId === sel}
            className={i.categoryId === sel ? "tab on" : "tab"} onClick={() => setSel(i.categoryId)}>
            {i.categoryLabel}
          </button>
        ))}
      </div>
      <article className="statement">
        <div className="title">{s.title}</div>
        {s.subtitle && <div className="sub">{s.subtitle}</div>}
        {s.hasImage && images[s.categoryId] && <ViewablePhoto src={images[s.categoryId]} title={s.title} className="thumb" />}
        {s.body && <div className="body">{s.body}</div>}
        {s.credits && <div className="credits">{s.credits}</div>}
      </article>
    </>
  );
}
