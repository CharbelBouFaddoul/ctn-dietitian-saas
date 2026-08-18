import Link from "next/link";
import { PhasePlaceholder } from "@nutrition-saas/ui";

export default function HomePage() {
  return (
    <PhasePlaceholder surface="Public">
      Phase 5 practice workspace is at{" "}
      <Link href="/orgs" style={{ color: "var(--color-accent)" }}>
        /orgs
      </Link>
      . Sign in at{" "}
      <Link href="/auth" style={{ color: "var(--color-accent)" }}>
        /auth
      </Link>
      .
    </PhasePlaceholder>
  );
}
