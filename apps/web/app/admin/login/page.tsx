import { SignInForm } from "../../auth/sign-in-form";

export default function AdminLoginPage() {
  return (
    <SignInForm
      audience="admin"
      title="Admin sign in"
      description="Platform administration is assigned, not self-registered. Clinic owners cannot use this area."
    />
  );
}
