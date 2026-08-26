import { redirect } from "next/navigation";
import { isPlansPageEnabled } from "../../../lib/marketing/plans-page-enabled";
import { PlansPageClient } from "./plans-page-client";

export default async function PlansPage() {
  if (!(await isPlansPageEnabled())) {
    redirect("/contact");
  }
  return <PlansPageClient />;
}
