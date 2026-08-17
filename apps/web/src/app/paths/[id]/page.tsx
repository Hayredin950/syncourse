import PathDetailPage from "./page-client";
import { pathIds } from "@/lib/static-params";

// Every real path id is exported so deep links and client navigation resolve.
export async function generateStaticParams() {
  return pathIds();
}

export default function PathRoute() {
  return <PathDetailPage />;
}
