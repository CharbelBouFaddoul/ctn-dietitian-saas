"use client";

import { ChartNotesSection } from "./chart-notes-list";

export function ClientMealNotesRail({
  dietitianAccountId,
  clientId,
  allowManage,
  onError,
}: {
  dietitianAccountId: string;
  clientId: string;
  allowManage: boolean;
  onError: (message: string) => void;
}) {
  return (
    <ChartNotesSection
      className="ui-clinical-rail ui-mp__notes-rail"
      dietitianAccountId={dietitianAccountId}
      clientId={clientId}
      kind="MEAL"
      title="Meal notes"
      empty="No meal notes yet"
      allowManage={allowManage}
      onError={onError}
    />
  );
}
