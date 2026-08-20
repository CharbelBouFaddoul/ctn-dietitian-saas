import { redirect } from "next/navigation";

export default function DietitianAuthPage() {
  redirect("/auth/login");
}
