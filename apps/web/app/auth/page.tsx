import { redirect } from "next/navigation";

export default function AuthIndexPage() {
  redirect("/auth/dietitian/login");
}
