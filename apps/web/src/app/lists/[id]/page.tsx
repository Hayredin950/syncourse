import ListDetailPageClient from "./page-client";
import { listIds } from "@/lib/static-params";

// Every real list id is exported so deep links and client navigation resolve.
export async function generateStaticParams() {
  return listIds();
}

export default function ListDetailPage() {
  return <ListDetailPageClient />;
}
