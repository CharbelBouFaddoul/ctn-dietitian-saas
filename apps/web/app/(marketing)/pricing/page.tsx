import { redirect } from "next/navigation";
import { isPlansPageEnabled } from "../../../lib/marketing/plans-page-enabled";

export default async function PricingPage() {
  redirect((await isPlansPageEnabled()) ? "/plans" : "/contact");
}
