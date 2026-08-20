"use client";

import { useEffect, useState } from "react";
import { Alert, Card, PageHeader } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";

interface PortalMe {
  client: {
    firstName: string;
    lastName: string;
    displayName: string | null;
  };
  practiceName?: string | null;
}

export default function ClientProfilePage() {
  const [data, setData] = useState<PortalMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<PortalMe>("/api/v1/portal/me")
      .then(setData)
      .catch((err) => setError(errorMessage(err, "Unable to load profile")));
  }, []);

  return (
    <section>
      <PageHeader title="Profile" description="The name your dietitian sees on their client list." />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Card>
        <p>
          <strong>{(data?.client.displayName ?? `${data?.client.firstName ?? ""} ${data?.client.lastName ?? ""}`.trim()) || "—"}</strong>
        </p>
        {data?.practiceName ? <p className="ui-muted">{data.practiceName}</p> : <p className="ui-muted">Connected to your dietitian.</p>}
      </Card>
    </section>
  );
}
