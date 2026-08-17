import LecturerPage from "./page-client";
import { lecturerSlugs } from "@/lib/static-params";

// Every real lecturer slug is exported so deep links and client navigation resolve.
export async function generateStaticParams() {
  return lecturerSlugs();
}

export default function LecturerRoute() {
  return <LecturerPage />;
}
