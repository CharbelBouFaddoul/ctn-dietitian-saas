# P3 remaining limitations

P3 did not add backend APIs. These screens are honest about missing data:

- **Practice calendar** uses dashboard `upcomingAppointments` only. There is no organization-wide appointments index.
- **Unread message counts** and **meal-plan expiry feeds** are not available; dashboards do not invent them.
- **Practice Documents** is a client picker. Documents remain per-client.
- **Client Progress** is composed from the current tracking summary, not a history/analytics API.
- **Contact** on the public site is a local form (no contact API).
- **Pricing** describes plan families in product language; catalog prices stay in admin.

Join-code architecture, session guards, tenant guards, entitlements, and Prisma were not changed.
