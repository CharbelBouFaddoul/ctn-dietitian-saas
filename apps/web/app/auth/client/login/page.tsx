import { SignInForm } from "../../sign-in-form";

export default function ClientLoginPage() {
  return (
    <SignInForm
      audience="client"
      title="Sign in as Patient"
      description="Sign in with the email you registered. If you are not connected yet, you’ll enter your dietitian’s join code next."
    />
  );
}
