export const AUTH_MESSAGES = {
  invalidCredentials: "Invalid email or password",
  authenticationRequired: "Authentication required",
  register: "If this email can be registered, we sent a verification link.",
  registrationDisabled: "Self-registration is currently disabled",
  forgotPassword: "If an account exists for that email, we sent a reset link.",
  resendVerification: "If a verification email is needed, we sent one.",
  emailVerified: "Email verified. You can sign in.",
  passwordReset: "Password updated. Sign in with your new password.",
  invitationAccepted: "Invitation accepted. You can sign in.",
  loggedOut: "Signed out",
  invalidVerificationToken: "Invalid or expired verification token",
  invalidResetToken: "Invalid or expired reset token",
  invalidInvitationToken: "Invalid or expired invitation token",
  passwordTooShort: "Password does not meet the minimum length requirement",
  passwordTooLong: "Password is too long",
  passwordComplexity: "Password must include at least one letter and one number",
} as const;

export const GENERIC_LOGIN_FAILURE = AUTH_MESSAGES.invalidCredentials;
