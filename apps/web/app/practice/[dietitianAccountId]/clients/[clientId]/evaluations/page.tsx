"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePractice } from "../../../practice-shell";

/** Redirects to the client chart Evaluation tab (assign/review lives there). */
export default function ClientEvaluationsRedirectPage() {
  const { dietitianAccountId } = usePractice();
  const params = useParams<{ clientId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(
      `/practice/${dietitianAccountId}/clients/${params.clientId}?tab=assessments`,
    );
  }, [dietitianAccountId, params.clientId, router]);

  return <p className="ui-muted">Opening evaluations…</p>;
}
