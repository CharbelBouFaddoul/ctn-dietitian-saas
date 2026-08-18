"use client";

import Link from "next/link";

export default function AdminHomePage() {
  return (
    <section>
      <h1>Platform administration</h1>
      <p style={{ color: "var(--color-muted)", maxWidth: 640 }}>
        One subscription per organization. Plans, features, and overrides are database-driven.
        AI is a plan feature, not a separate subscription. V1 has no payment processor.
      </p>
      <ul>
        <li>
          <Link href="/admin/organizations">Organizations</Link>
        </li>
        <li>
          <Link href="/admin/plans">Plans</Link>
        </li>
        <li>
          <Link href="/admin/audit">Audit logs</Link>
        </li>
      </ul>
    </section>
  );
}
