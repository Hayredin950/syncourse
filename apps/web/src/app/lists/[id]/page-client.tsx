"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * Legacy deep link. The real page is /lists/detail?id=… — see the comment there
 * for why. This route stays because links to /lists/<id> are already in the
 * wild (they were shareable), and it only resolves for ids that existed at build
 * time; anything newer never had a file here to begin with.
 */
export default function ListDetailPageClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/lists/detail?id=${encodeURIComponent(id)}`);
  }, [id, router]);

  return <div className="p-4 text-center text-sm text-muted">Opening list…</div>;
}
