"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, PageHeader, StatCard, humanizeLabel } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

interface Usage {
  enabled: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  periodKey: string;
}

export default function PracticeAiPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Usage>(`/api/v1/organizations/${organizationId}/ai/usage`)
      .then(setUsage)
      .catch((err) => setError(errorMessage(err, "Unable to load AI usage")));
  }, [organizationId]);

  return (
    <section>
      <PageHeader
        title="AI assist"
        description="Drafts you review before anything reaches a client. Open a client workspace to generate summaries, meal-plan suggestions, or message drafts."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="ui-grid">
        <StatCard label="Enabled" value={usage?.enabled ? "Yes" : usage ? "No" : "—"} />
        <StatCard label="Used" value={usage ? `${usage.used}${usage.limit !== null ? ` / ${usage.limit}` : ""}` : "—"} />
        <StatCard
          label="Remaining"
          value={usage?.remaining ?? "—"}
          hint={usage?.periodKey ? humanizeLabel(usage.periodKey) : undefined}
        />
      </div>
      <p style={{ marginTop: 24 }}>
        <Link href={`/orgs/${organizationId}/clients`} className="ui-btn ui-btn--primary">
          Open a client
        </Link>
      </p>
    </section>
  );
}
