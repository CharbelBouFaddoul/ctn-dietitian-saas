export const ADMIN_MESSAGES = {
  forbidden: "Platform administration is not available",
  planNotAssignable: "Only ACTIVE plans can be assigned",
  planReferenced: "Plans that are referenced by subscriptions cannot be deleted",
  lastSuperAdmin: "At least one SUPER_ADMIN must remain",
  noSubscription: "Organization has no subscription",
  featureNotFound: "Feature not found",
  planNotFound: "Plan not found",
  organizationNotFound: "Organization not found",
  userNotFound: "User not found",
  invalidOverride: "Override must set enabled and/or limitValue",
} as const;
