import { redirect } from "next/navigation";

export default function DietitianAuthIndexPage() {
  redirect("/auth/dietitian/login");
}
