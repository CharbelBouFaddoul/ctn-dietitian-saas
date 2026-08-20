import { redirect } from "next/navigation";

export default function ClientAuthIndexPage() {
  redirect("/auth/client/login");
}
