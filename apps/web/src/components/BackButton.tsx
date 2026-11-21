"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Returns to the page the reader actually came from.
 *
 * Detail pages used to hardcode a link to the section index (or home), so a
 * reader who arrived from search, a course page or another profile lost their
 * place. `history.back()` keeps that trail; the fallback is only for direct
 * landings — a shared link opened in a fresh tab — where there is no trail.
 */
export default function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="back-btn"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
    >
      <ArrowLeft size={14} /> Back
    </button>
  );
}
