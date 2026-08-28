"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, LoadingState, PageHeader, Tabs } from "@nutrition-saas/ui";
import { api } from "../../../../lib/api";
import { errorMessage } from "../../../../lib/humanize-error";
import { AccountTab } from "./account-tab";
import { AppointmentsTab } from "./appointments-tab";
import { ClinicalTab } from "./clinical-tab";
import { DocumentsTab } from "./documents-tab";
import { PortalTab } from "./portal-tab";
import { PracticeTab } from "./practice-tab";
import { PreferencesTab } from "./preferences-tab";
import { ProfileTab } from "./profile-tab";
import {
  PROFILE_TABS,
  isProfileTab,
  type DietitianProfile,
  type DietitianSettings,
  type ProfileTabId,
  PROFILE_FORM_ID,
} from "./profile-types";

export default function PracticeSettingsPage() {
  return (
    <Suspense fallback={<LoadingState>Loading profile…</LoadingState>}>
      <PracticeSettingsPageInner />
    </Suspense>
  );
}

function PracticeSettingsPageInner() {
  const params = useParams<{ dietitianAccountId: string }>();
  const dietitianAccountId = params.dietitianAccountId;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: ProfileTabId = isProfileTab(tabParam) ? tabParam : "profile";

  const [profile, setProfile] = useState<DietitianProfile | null>(null);
  const [settings, setSettings] = useState<DietitianSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const snapshot = useRef<{ profile: DietitianProfile; settings: DietitianSettings } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api<DietitianProfile>(`/api/v1/dietitian/${dietitianAccountId}`),
      api<DietitianSettings>(`/api/v1/dietitian/${dietitianAccountId}/settings`),
    ])
      .then(([nextProfile, nextSettings]) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setSettings(nextSettings);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err, "Unable to load profile"));
      });
    return () => {
      cancelled = true;
    };
  }, [dietitianAccountId]);

  function enterEdit() {
    if (!profile || !settings) return;
    snapshot.current = {
      profile: structuredClone(profile),
      settings: structuredClone(settings),
    };
    setEditing(true);
  }

  function cancelEdit() {
    if (snapshot.current) {
      setProfile(snapshot.current.profile);
      setSettings(snapshot.current.settings);
      snapshot.current = null;
    }
    setSaving(false);
    setEditing(false);
  }

  function onSaved() {
    snapshot.current = null;
    setSaving(false);
    setEditing(false);
  }

  function setTab(next: string) {
    if (editing) cancelEdit();
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (loadError) {
    return <Alert tone="danger">{loadError}</Alert>;
  }

  if (!profile || !settings) {
    return <LoadingState>Loading profile…</LoadingState>;
  }

  const editor = { editing, saving, onSaved, onSaving: setSaving };

  return (
    <section className={`ui-profile-hub${editing ? " is-editing" : ""}`}>
      <PageHeader
        title="Profile"
        actions={
          editing ? (
            <>
              <Button type="button" variant="ghost" disabled={saving} onClick={cancelEdit}>
                Cancel
              </Button>
              <Button type="submit" form={PROFILE_FORM_ID} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" onClick={enterEdit}>
              Edit
            </Button>
          )
        }
      />
      <Tabs items={[...PROFILE_TABS]} value={tab} onChange={setTab} variant="line" />
      {tab === "profile" ? (
        <ProfileTab dietitianAccountId={dietitianAccountId} profile={profile} onProfile={setProfile} {...editor} />
      ) : null}
      {tab === "practice" ? (
        <PracticeTab dietitianAccountId={dietitianAccountId} settings={settings} onSettings={setSettings} {...editor} />
      ) : null}
      {tab === "preferences" ? (
        <PreferencesTab
          dietitianAccountId={dietitianAccountId}
          settings={settings}
          onSettings={setSettings}
          {...editor}
        />
      ) : null}
      {tab === "appointments" ? (
        <AppointmentsTab
          dietitianAccountId={dietitianAccountId}
          settings={settings}
          onSettings={setSettings}
          {...editor}
        />
      ) : null}
      {tab === "documents" ? (
        <DocumentsTab dietitianAccountId={dietitianAccountId} settings={settings} onSettings={setSettings} {...editor} />
      ) : null}
      {tab === "clinical" ? (
        <ClinicalTab dietitianAccountId={dietitianAccountId} settings={settings} onSettings={setSettings} {...editor} />
      ) : null}
      {tab === "portal" ? (
        <PortalTab dietitianAccountId={dietitianAccountId} settings={settings} onSettings={setSettings} {...editor} />
      ) : null}
      {tab === "account" ? <AccountTab email={profile.email} {...editor} /> : null}
    </section>
  );
}
