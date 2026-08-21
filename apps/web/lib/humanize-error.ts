const EXACT_COPY: Record<string, string> = {
  "Client access denied":
    "You don’t have access to this client. It may be unassigned or assigned to someone else.",
  "Dietitian account access denied": "You don’t have access to this clinic.",
  "Organization access denied": "You don’t have access to this clinic.",
  "Authentication required": "Sign in to continue.",
  "Platform administration is not available": "This area is for platform administrators only.",
  "This client is not available": "This client is no longer available.",
  "This client already has a portal account": "This client already has a connected portal account.",
  "That code didn't work. The code may be expired, revoked, or already used. Please check the code with your dietitian.":
    "That code didn't work. The code may be expired, revoked, or already used. Please check the code with your dietitian.",
  "This join code has expired. Ask your dietitian to generate a new code.":
    "This join code has expired. Ask your dietitian to generate a new code.",
  "This join code has already been used.": "This join code has already been used.",
  "Your account is already connected to a client profile.": "Your account is already connected to a client profile.",
  "This account cannot join a client portal.": "This account cannot join a client portal.",
  "Client limit reached for this clinic":
    "This clinic has reached its client limit. Ask your dietitian to upgrade or free a spot.",
  "Client limit reached for this dietitian account":
    "This clinic has reached its client limit. Ask your dietitian to upgrade or free a spot.",
  "Client limit reached for this organization":
    "This clinic has reached its client limit. Ask your dietitian to upgrade or free a spot.",
  "Invalid credentials": "Email or password is incorrect.",
  "Email is not verified": "Verify your email before signing in.",
  "Account is disabled": "This account is no longer active.",
  "Appointment end must be after start": "End time must be after the start time.",
  "Appointment overlaps an existing appointment":
    "That time overlaps another appointment. Choose a free slot.",
  "Resolve or reject the pending reschedule before editing":
    "Accept or reject the pending reschedule before editing this appointment.",
  "Cancelled appointments cannot be edited": "Cancelled appointments can’t be edited.",
  "Only upcoming appointments can be cancelled": "Only upcoming appointments can be cancelled.",
  "A reschedule proposal is already pending": "A reschedule proposal is already pending.",
  "No pending reschedule proposal": "There’s no pending reschedule to respond to.",
  "You cannot accept your own reschedule proposal": "Wait for the other party to accept this proposal.",
  "You cannot reject your own reschedule proposal": "Wait for the other party to respond to this proposal.",
};

const GENERIC_500 = "Something went wrong. Please try again.";

export function humanizeApiMessage(message: string): string {
  const trimmed = message.trim();
  if (EXACT_COPY[trimmed]) {
    return EXACT_COPY[trimmed];
  }
  for (const [key, copy] of Object.entries(EXACT_COPY)) {
    if (trimmed.includes(key)) {
      return copy;
    }
  }
  if (/internal server error|unexpected|prisma|sql|stack/i.test(trimmed)) {
    return GENERIC_500;
  }
  return trimmed;
}

export function errorMessage(err: unknown, fallback = GENERIC_500): string {
  if (err instanceof Error && err.message) {
    const status = "status" in err && typeof err.status === "number" ? err.status : undefined;
    if (status !== undefined && status >= 500) {
      return GENERIC_500;
    }
    return humanizeApiMessage(err.message);
  }
  return fallback;
}
