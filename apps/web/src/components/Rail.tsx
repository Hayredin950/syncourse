"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function Rail({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between px-4">
        <h2 className="text-base font-semibold text-text">{title}</h2>
        {href && (
          <Link href={href} className="text-sm font-medium text-muted hover:text-text">
            See all &gt;
          </Link>
        )}
      </div>
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-1">{children}</div>
    </section>
  );
}
