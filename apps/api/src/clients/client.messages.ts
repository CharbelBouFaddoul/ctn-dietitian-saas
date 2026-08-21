export const CLIENT_ACCESS_DENIED = "Client access denied";
export const CLIENT_NOT_AVAILABLE = "This client is not available";
export const CLIENT_LIMIT_REACHED = "Client limit reached for this practice";
export const CLIENT_EMAIL_IN_USE = "A portal account cannot be created for this email";
export const CLIENT_ACCOUNT_EXISTS = "This client already has a portal account";
export const JOIN_CODE_INVALID =
  "That code didn't work. The code may be expired, revoked, or already used. Please check the code with your dietitian.";
export const JOIN_CODE_EXPIRED = "This join code has expired. Ask your dietitian to generate a new code.";
export const JOIN_CODE_USED = "This join code has already been used.";
export const JOIN_ALREADY_CONNECTED = "Your account is already connected to a client profile.";
export const JOIN_NOT_ALLOWED = "This account cannot join a client portal.";
export const JOIN_PRACTICE_LOCKED =
  "This practice is not accepting new connections right now. Ask your dietitian after their subscription is renewed.";
export const PORTAL_CONNECTION_REQUIRED =
  "Select an active practice connection before continuing.";
export const DISCONNECT_REQUEST_PENDING =
  "You already asked to leave this clinic. Your dietitian still needs to confirm.";
export const DISCONNECT_REQUEST_NONE = "There is no pending disconnect request for this connection.";
/** Optional leave note: keep short for dietitian notifications. */
export const DISCONNECT_NOTE_MAX_WORDS = 50;
export const DISCONNECT_NOTE_TOO_LONG = `Keep your note to ${DISCONNECT_NOTE_MAX_WORDS} words or fewer.`;
