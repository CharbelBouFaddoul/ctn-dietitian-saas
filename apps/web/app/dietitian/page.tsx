import Link from "next/link";

export default function DietitianPage() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Dietitian workspace</h1>
      <p>
        Open a practice from{" "}
        <Link href="/orgs" style={{ color: "var(--color-accent)" }}>
          Organizations
        </Link>
        .
      </p>
    </main>
  );
}
