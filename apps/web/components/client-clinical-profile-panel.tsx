"use client";

import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  StatusBadge,
  Textarea,
  humanizeLabel,
} from "@nutrition-saas/ui";
import { ClinicTagsManager } from "./clinic-tags-manager";
import { DocumentsLibrary, type DocumentsLibraryItem } from "./documents-library";
import { api, apiUrl } from "../lib/api";
import {
  ACTIVITY_OPTIONS,
  ALCOHOL_OPTIONS,
  ALLERGY_OPTIONS,
  BACKGROUND_OPTIONS,
  BOWEL_OPTIONS,
  CLINICAL_AIM_OPTIONS,
  CONDITION_OPTIONS,
  DEFICIENCY_OPTIONS,
  DIET_STYLE_OPTIONS,
  HOUSEHOLD_OPTIONS,
  INTOLERANCE_OPTIONS,
  MEAL_SLOT_OPTIONS,
  SLEEP_OPTIONS,
  SMOKING_OPTIONS,
  WATER_OPTIONS,
  emptyClinicalData,
  mealSlotLabel,
  type ClinicalData,
  type SelectOption,
} from "../lib/clinical-profile";
import {
  CLINICAL_FILE_ACCEPT,
  CLINICAL_FILE_HINT,
  assertClinicalDocumentFile,
  downloadAuthenticatedFile,
} from "../lib/documents";
import { formatDate, formatDateOnly, localDateInputValue } from "../lib/format";
import { errorMessage } from "../lib/humanize-error";

type ChartNote = {
  id: string;
  kind: "CLINICAL" | "MEAL" | "EATING_HABIT" | "PREGNANCY";
  body: string;
  mealSlot: string | null;
  notedAt?: string;
  createdAt: string;
};

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  targetDate: string | null;
};

type ClientIdentity = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: string;
};

type Props = {
  dietitianAccountId: string;
  clientId: string;
  base: string;
  orgBase: string;
  allowManage: boolean;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    sex: string | null;
    status?: string | null;
    createdAt?: string | null;
    tags: Array<{ id: string; name: string; color?: string | null }>;
  };
  orgTags: Array<{ id: string; name: string }>;
  selectedTagIds: string[];
  onOrgTagsChange: (tags: Array<{ id: string; name: string }>) => void;
  onSelectedTagIdsChange: (ids: string[]) => void;
  onError: (message: string) => void;
  onPortfolioRefresh: () => Promise<unknown>;
  onDeleteClient?: () => void;
};

function identityFromClient(client: Props["client"]): ClientIdentity {
  return {
    firstName: client.firstName,
    lastName: client.lastName,
    displayName: client.displayName ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    dateOfBirth: client.dateOfBirth?.slice(0, 10) ?? "",
    sex: client.sex ?? "UNSPECIFIED",
  };
}

function ageFromDob(value: string): number | null {
  if (!value) return null;
  const dob = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const month = now.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function patientIdLabel(id: string): string {
  return id.replace(/-/g, "").slice(0, 9).toUpperCase();
}

const IDENTITY_PLACEHOLDER = "Write here...";

function useOverflowHint() {
  const ref = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(false);
  const [below, setBelow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      setAbove(el.scrollTop > 8);
      setBelow(max - el.scrollTop > 8);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    const watchChildren = () => {
      for (const child of el.children) resize.observe(child);
    };
    watchChildren();
    const mutate = new MutationObserver(() => {
      watchChildren();
      update();
    });
    mutate.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
      mutate.disconnect();
    };
  }, []);

  return { ref, above, below };
}

function SelectNotes({
  selectLabel,
  notesLabel,
  options,
  code,
  notes,
  disabled,
  onCode,
  onNotes,
}: {
  selectLabel: string;
  notesLabel: string;
  options: SelectOption[];
  code: string;
  notes: string;
  disabled: boolean;
  onCode: (value: string) => void;
  onNotes: (value: string) => void;
}) {
  return (
    <div className="ui-clinical-question">
      <span className="ui-clinical-question__title">{selectLabel}</span>
      <Select value={code} disabled={disabled} aria-label={selectLabel} onChange={(event) => onCode(event.target.value)}>
        {options.map((option) => (
          <option key={option.value || "blank"} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Input
        value={notes}
        disabled={disabled}
        placeholder="Write here..."
        aria-label={notesLabel}
        onChange={(event) => onNotes(event.target.value)}
      />
    </div>
  );
}

function ClinicalBlock({
  title,
  children,
  initiallyOpen = true,
  actions,
}: {
  title: string;
  children: ReactNode;
  initiallyOpen?: boolean;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details
      className="ui-clinical-block"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="ui-clinical-block__summary">
        <span>{title}</span>
        {actions ? (
          <span
            className="ui-clinical-block__actions"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {actions}
          </span>
        ) : null}
      </summary>
      <div className="ui-clinical-block__body">{children}</div>
    </details>
  );
}

function RailAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="ui-clinical-rail__icon-btn" onClick={onClick} aria-label={label} title={label}>
      <span aria-hidden>+</span>
    </button>
  );
}

function RailIconButton({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ui-clinical-rail__icon-btn${danger ? " ui-clinical-rail__icon-btn--danger" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

/** Simple trash can glyph for rail delete actions. */
const IconTrash = (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M3 4h10M6 4V3h4v1M5 4l.6 9h4.8L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function NoteList({
  rows,
  empty,
  allowManage,
  onRemove,
  meal,
}: {
  rows: ChartNote[];
  empty: string;
  allowManage: boolean;
  onRemove: (id: string) => void;
  meal?: boolean;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (rows.length === 0) return <EmptyState title={empty} />;
  return (
    <>
      <ul className="ui-clinical-rail__list">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="ui-clinical-rail__copy">
              {meal ? <strong>{mealSlotLabel(row.mealSlot)}</strong> : null}
              <p>{row.body}</p>
              <div className="ui-clinical-rail__meta">
                <span className="ui-muted">{formatDateOnly(row.notedAt ?? row.createdAt)}</span>
                {allowManage ? (
                  <div className="ui-clinical-rail__actions">
                    <RailIconButton label="Remove note" danger onClick={() => setPendingId(row.id)}>
                      {IconTrash}
                    </RailIconButton>
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pendingId != null}
        title="Remove this note?"
        description="This note will be deleted from the chart."
        confirmLabel="Remove"
        danger
        onCancel={() => setPendingId(null)}
        onConfirm={() => {
          if (pendingId) onRemove(pendingId);
          setPendingId(null);
        }}
      />
    </>
  );
}

export function ClientClinicalProfilePanel({
  dietitianAccountId,
  clientId,
  base,
  orgBase,
  allowManage,
  client,
  orgTags,
  selectedTagIds,
  onOrgTagsChange,
  onSelectedTagIdsChange,
  onError,
  onPortfolioRefresh,
  onDeleteClient,
}: Props) {
  const [identity, setIdentity] = useState<ClientIdentity>(() => identityFromClient(client));
  const [clinical, setClinical] = useState<ClinicalData>(emptyClinicalData);
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [notes, setNotes] = useState<ChartNote[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [documents, setDocuments] = useState<DocumentsLibraryItem[] | null>(null);
  const [clinicalNote, setClinicalNote] = useState("");
  const [clinicalNoteDate, setClinicalNoteDate] = useState(() => localDateInputValue());
  const [mealSlot, setMealSlot] = useState("BREAKFAST");
  const [mealNote, setMealNote] = useState("");
  const [mealNoteDate, setMealNoteDate] = useState(() => localDateInputValue());
  const [habitNote, setHabitNote] = useState("");
  const [habitNoteDate, setHabitNoteDate] = useState(() => localDateInputValue());
  const [pregnancyNote, setPregnancyNote] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("");
  const [goalOpen, setGoalOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [clinicalNoteOpen, setClinicalNoteOpen] = useState(false);
  const [mealNoteOpen, setMealNoteOpen] = useState(false);
  const [habitNoteOpen, setHabitNoteOpen] = useState(false);
  const [pregnancyOpen, setPregnancyOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [savingClinical, setSavingClinical] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    setIdentity(identityFromClient(client));
  }, [client]);

  async function loadProfile() {
    const profile = await api<{
      clinicalData?: ClinicalData;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
    }>(`${base}/profile`);
    setClinical({
      ...emptyClinicalData(),
      ...(profile.clinicalData ?? {}),
      nutrition: {
        ...emptyClinicalData().nutrition,
        ...(profile.clinicalData?.nutrition ?? {}),
        targets: {
          ...emptyClinicalData().nutrition.targets,
          ...(profile.clinicalData?.nutrition?.targets ?? {}),
        },
      },
      identity: {
        ...emptyClinicalData().identity,
        ...(profile.clinicalData?.identity ?? {}),
      },
    });
    setEmergencyName(profile.emergencyContactName ?? "");
    setEmergencyPhone(profile.emergencyContactPhone ?? "");
  }

  async function loadNotes() {
    const rows = await api<ChartNote[]>(`${base}/chart-notes`);
    setNotes(rows);
  }

  async function loadGoals() {
    const rows = await api<GoalRow[]>(`${base}/goals`);
    setGoals(rows);
  }

  async function loadDocuments() {
    setDocuments(await api<DocumentsLibraryItem[]>(`${base}/documents`));
  }

  useEffect(() => {
    void Promise.all([loadProfile(), loadNotes(), loadGoals(), loadDocuments()]).catch((err) =>
      onError(errorMessage(err, "Unable to load personal data")),
    );
  }, [base]);

  function patchClinical<K extends keyof ClinicalData>(
    section: K,
    field: keyof ClinicalData[K],
    value: ClinicalData[K][keyof ClinicalData[K]],
  ) {
    setClinical((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  }

  function patchNutritionTarget(field: keyof ClinicalData["nutrition"]["targets"], raw: string) {
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    setClinical((prev) => ({
      ...prev,
      nutrition: {
        ...prev.nutrition,
        targets: {
          ...prev.nutrition.targets,
          [field]: next != null && Number.isFinite(next) && next >= 0 ? next : null,
        },
      },
    }));
  }

  async function saveIdentity(event: FormEvent) {
    event.preventDefault();
    if (!identity.firstName.trim() || !identity.lastName.trim()) {
      onError("First and last name are required");
      return;
    }
    if (identity.dateOfBirth) {
      const dob = new Date(`${identity.dateOfBirth}T00:00:00`);
      if (dob.getTime() > Date.now()) {
        onError("Date of birth cannot be in the future");
        return;
      }
    }
    setSavingIdentity(true);
    try {
      await api(base, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: identity.firstName.trim(),
          lastName: identity.lastName.trim(),
          displayName: identity.displayName.trim() || undefined,
          email: identity.email.trim() || undefined,
          phone: identity.phone.trim() || undefined,
          dateOfBirth: identity.dateOfBirth || undefined,
          sex: identity.sex || undefined,
        }),
      });
      await api(`${base}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          clinicalData: clinical,
          emergencyContactName: emergencyName || null,
          emergencyContactPhone: emergencyPhone || null,
        }),
      });
      await onPortfolioRefresh();
    } catch (err) {
      onError(errorMessage(err, "Unable to save identity"));
    } finally {
      setSavingIdentity(false);
    }
  }

  async function saveClinical(event: FormEvent) {
    event.preventDefault();
    setSavingClinical(true);
    try {
      await api(`${base}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          clinicalData: clinical,
          emergencyContactName: emergencyName || null,
          emergencyContactPhone: emergencyPhone || null,
        }),
      });
    } catch (err) {
      onError(errorMessage(err, "Unable to save clinical profile"));
    } finally {
      setSavingClinical(false);
    }
  }

  async function addNote(kind: ChartNote["kind"], body: string, slot?: string, notedAt?: string) {
    const trimmed = body.trim();
    if (!trimmed) {
      onError(kind === "MEAL" ? "Write a meal note before saving" : "Write a note before saving");
      return;
    }
    if (kind === "MEAL" && !slot) {
      onError("Choose which meal this note is for");
      return;
    }
    if (noteBusy) return;
    setNoteBusy(true);
    try {
      await api(`${base}/chart-notes`, {
        method: "POST",
        body: JSON.stringify({ kind, body: trimmed, mealSlot: slot, notedAt: notedAt || undefined }),
      });
      if (kind === "CLINICAL") {
        setClinicalNote("");
        setClinicalNoteDate(localDateInputValue());
        setClinicalNoteOpen(false);
      }
      if (kind === "MEAL") {
        setMealNote("");
        setMealNoteDate(localDateInputValue());
        setMealNoteOpen(false);
      }
      if (kind === "EATING_HABIT") {
        setHabitNote("");
        setHabitNoteDate(localDateInputValue());
        setHabitNoteOpen(false);
      }
      if (kind === "PREGNANCY") {
        setPregnancyNote("");
        setPregnancyOpen(false);
      }
      await loadNotes();
    } catch (err) {
      onError(errorMessage(err, "Unable to add note"));
    } finally {
      setNoteBusy(false);
    }
  }

  async function removeNote(id: string) {
    try {
      await api(`${base}/chart-notes/${id}`, { method: "DELETE" });
      await loadNotes();
    } catch (err) {
      onError(errorMessage(err, "Unable to remove note"));
    }
  }

  async function addGoal(event: FormEvent) {
    event.preventDefault();
    const title = goalTitle.trim();
    if (!title) {
      onError("Goal title is required");
      return;
    }
    try {
      await api(`${base}/goals`, {
        method: "POST",
        body: JSON.stringify({
          title,
          description: goalDescription.trim() || undefined,
          targetDate: goalDeadline || undefined,
        }),
      });
      setGoalTitle("");
      setGoalDescription("");
      setGoalDeadline("");
      setGoalOpen(false);
      await Promise.all([loadGoals(), onPortfolioRefresh()]);
    } catch (err) {
      onError(errorMessage(err, "Unable to add goal"));
    }
  }

  const clinicalNotes = notes.filter((row) => row.kind === "CLINICAL");
  const mealNotes = notes.filter((row) => row.kind === "MEAL");
  const habitNotes = notes.filter((row) => row.kind === "EATING_HABIT");
  const pregnancyNotes = notes.filter((row) => row.kind === "PREGNANCY");
  const identityAge = ageFromDob(identity.dateOfBirth);
  const mainHint = useOverflowHint();
  const railHint = useOverflowHint();

  return (
    <div className="ui-clinical">
      <div
        className={`ui-clinical__pane${mainHint.above ? " is-more-above" : ""}${mainHint.below ? " is-more-below" : ""}`}
      >
      <div className="ui-clinical__main" ref={mainHint.ref}>
        <form className="ui-clinical-identity-form" onSubmit={(event) => void saveIdentity(event)}>
          <ClinicalBlock title="Identity" initiallyOpen={false}>
            <div className="ui-clinical-identity">
              <div className="ui-clinical-identity__col">
                <div className="ui-clinical-identity__pair">
                  <Field label="First name">
                    <Input
                      value={identity.firstName}
                      required
                      disabled={!allowManage}
                      placeholder={IDENTITY_PLACEHOLDER}
                      onChange={(event) => setIdentity({ ...identity, firstName: event.target.value })}
                    />
                  </Field>
                  <Field label="Last name">
                    <Input
                      value={identity.lastName}
                      required
                      disabled={!allowManage}
                      placeholder={IDENTITY_PLACEHOLDER}
                      onChange={(event) => setIdentity({ ...identity, lastName: event.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Preferred name">
                  <Input
                    value={identity.displayName}
                    disabled={!allowManage}
                    placeholder={IDENTITY_PLACEHOLDER}
                    onChange={(event) => setIdentity({ ...identity, displayName: event.target.value })}
                  />
                </Field>
                <Field label="Tags">
                  <button
                    type="button"
                    className="ui-clinical-identity__tags"
                    disabled={!allowManage}
                    onClick={() => setTagsOpen(true)}
                  >
                    {client.tags.length > 0 ? client.tags.map((tag) => tag.name).join(", ") : IDENTITY_PLACEHOLDER}
                  </button>
                </Field>
                <div className="ui-clinical-identity__pair">
                  <Field label="Gender">
                    <Select
                      value={identity.sex}
                      disabled={!allowManage}
                      onChange={(event) => setIdentity({ ...identity, sex: event.target.value })}
                    >
                      <option value="FEMALE">Female</option>
                      <option value="MALE">Male</option>
                      <option value="OTHER">Other</option>
                      <option value="UNSPECIFIED">Unspecified</option>
                    </Select>
                  </Field>
                  <Field label={identityAge != null ? `Birthdate (${identityAge} years)` : "Birthdate"}>
                    <Input
                      type="date"
                      value={identity.dateOfBirth}
                      disabled={!allowManage}
                      onChange={(event) => setIdentity({ ...identity, dateOfBirth: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="ui-clinical-identity__pair">
                  <Field label="Occupation">
                    <Input
                      value={clinical.identity.occupation}
                      disabled={!allowManage}
                      placeholder={IDENTITY_PLACEHOLDER}
                      onChange={(event) => patchClinical("identity", "occupation", event.target.value)}
                    />
                  </Field>
                  <Field label="Workplace">
                    <Input
                      value={clinical.identity.workplace}
                      disabled={!allowManage}
                      placeholder={IDENTITY_PLACEHOLDER}
                      list="identity-workplace"
                      onChange={(event) => patchClinical("identity", "workplace", event.target.value)}
                    />
                    <datalist id="identity-workplace">
                      <option value="Online" />
                      <option value="In person" />
                      <option value="Hybrid" />
                      <option value="Remote" />
                    </datalist>
                  </Field>
                </div>
                <div className="ui-clinical-identity__pair">
                  <Field label="Process number">
                    <Input
                      value={clinical.identity.processNumber}
                      disabled={!allowManage}
                      placeholder={IDENTITY_PLACEHOLDER}
                      onChange={(event) => patchClinical("identity", "processNumber", event.target.value)}
                    />
                  </Field>
                  <Field label="Health number">
                    <Input
                      value={clinical.identity.healthNumber}
                      disabled={!allowManage}
                      placeholder={IDENTITY_PLACEHOLDER}
                      onChange={(event) => patchClinical("identity", "healthNumber", event.target.value)}
                    />
                  </Field>
                </div>
                <div className="ui-clinical-identity__pair">
                  <Field label="National number">
                    <Input
                      value={clinical.identity.nationalNumber}
                      disabled={!allowManage}
                      placeholder={IDENTITY_PLACEHOLDER}
                      onChange={(event) => patchClinical("identity", "nationalNumber", event.target.value)}
                    />
                  </Field>
                  <Field label="VAT number">
                    <Input
                      value={clinical.identity.vatNumber}
                      disabled={!allowManage}
                      placeholder={IDENTITY_PLACEHOLDER}
                      onChange={(event) => patchClinical("identity", "vatNumber", event.target.value)}
                    />
                  </Field>
                </div>
              </div>
              <div className="ui-clinical-identity__col">
                <Field label="Email">
                  <Input
                    type="email"
                    value={identity.email}
                    disabled={!allowManage}
                    placeholder={IDENTITY_PLACEHOLDER}
                    onChange={(event) => setIdentity({ ...identity, email: event.target.value })}
                  />
                </Field>
                <Field label="Mobile phone">
                  <Input
                    type="tel"
                    value={identity.phone}
                    disabled={!allowManage}
                    placeholder={IDENTITY_PLACEHOLDER}
                    onChange={(event) => setIdentity({ ...identity, phone: event.target.value })}
                  />
                </Field>
                <div className="ui-clinical-identity__pair">
                  <Field label="Country">
                    <Input
                      value={clinical.identity.country}
                      disabled={!allowManage}
                      placeholder={IDENTITY_PLACEHOLDER}
                      onChange={(event) => patchClinical("identity", "country", event.target.value)}
                    />
                  </Field>
                  <Field label="Zip code">
                    <Input
                      value={clinical.identity.zipCode}
                      disabled={!allowManage}
                      placeholder={IDENTITY_PLACEHOLDER}
                      onChange={(event) => patchClinical("identity", "zipCode", event.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Address">
                  <Input
                    value={clinical.identity.address}
                    disabled={!allowManage}
                    placeholder={IDENTITY_PLACEHOLDER}
                    onChange={(event) => patchClinical("identity", "address", event.target.value)}
                  />
                </Field>
                <div className="ui-clinical-identity__pair">
                  <Field label="Emergency contact">
                    <Input
                      value={emergencyName}
                      disabled={!allowManage}
                      placeholder={IDENTITY_PLACEHOLDER}
                      onChange={(event) => setEmergencyName(event.target.value)}
                    />
                  </Field>
                  <Field label="Emergency phone">
                    <Input
                      type="tel"
                      value={emergencyPhone}
                      disabled={!allowManage}
                      placeholder={IDENTITY_PLACEHOLDER}
                      onChange={(event) => setEmergencyPhone(event.target.value)}
                    />
                  </Field>
                </div>
              </div>
              <div className="ui-clinical-identity__foot">
                {onDeleteClient && client.status !== "ARCHIVED" ? (
                  <button type="button" className="ui-clinical-identity__delete" onClick={onDeleteClient}>
                    {IconTrash}
                    Delete client
                  </button>
                ) : null}
                <div className="ui-clinical-identity__meta">
                  <span>Created at {formatDate(client.createdAt)}</span>
                  <strong>Patient ID {patientIdLabel(client.id)}</strong>
                </div>
                <Button type="submit" size="sm" disabled={!allowManage || savingIdentity}>
                  {savingIdentity ? "Saving…" : "Save identity"}
                </Button>
              </div>
            </div>
          </ClinicalBlock>
        </form>

        <form className="ui-clinical-stack" onSubmit={(event) => void saveClinical(event)}>
          <p className="ui-clinical-lead">
            Default clinical questions for every patient. Custom questionnaires live on Custom forms.
          </p>
          <div className="ui-clinical-savebar">
            <Button type="submit" size="sm" disabled={!allowManage || savingClinical}>
              {savingClinical ? "Saving…" : "Save clinical profile"}
            </Button>
          </div>

          <ClinicalBlock title="Visit context">
            <Field label="Reason for visit">
              <Textarea
                value={clinical.visit.reason}
                disabled={!allowManage}
                placeholder="Write here..."
                onChange={(event) => patchClinical("visit", "reason", event.target.value)}
              />
            </Field>
            <Field label="What they hope to achieve">
              <Textarea
                value={clinical.visit.expectations}
                disabled={!allowManage}
                placeholder="Write here..."
                onChange={(event) => patchClinical("visit", "expectations", event.target.value)}
              />
            </Field>
            <SelectNotes
              selectLabel="Care aims"
              notesLabel="Care aims — notes"
              options={CLINICAL_AIM_OPTIONS}
              code={clinical.visit.clinicalAims}
              notes={clinical.visit.clinicalAimsNotes}
              disabled={!allowManage}
              onCode={(value) => patchClinical("visit", "clinicalAims", value)}
              onNotes={(value) => patchClinical("visit", "clinicalAimsNotes", value)}
            />
            <Field label="Additional visit notes">
              <Textarea
                value={clinical.visit.other}
                disabled={!allowManage}
                placeholder="Write here..."
                onChange={(event) => patchClinical("visit", "other", event.target.value)}
              />
            </Field>
          </ClinicalBlock>

          <ClinicalBlock title="Lifestyle & social background">
            <SelectNotes
              selectLabel="Bowel habits"
              notesLabel="Bowel habits — notes"
              options={BOWEL_OPTIONS}
              code={clinical.lifestyle.bowelHabits}
              notes={clinical.lifestyle.bowelHabitsNotes}
              disabled={!allowManage}
              onCode={(value) => patchClinical("lifestyle", "bowelHabits", value)}
              onNotes={(value) => patchClinical("lifestyle", "bowelHabitsNotes", value)}
            />
            <SelectNotes
              selectLabel="Sleep quality"
              notesLabel="Sleep quality — notes"
              options={SLEEP_OPTIONS}
              code={clinical.lifestyle.sleepQuality}
              notes={clinical.lifestyle.sleepQualityNotes}
              disabled={!allowManage}
              onCode={(value) => patchClinical("lifestyle", "sleepQuality", value)}
              onNotes={(value) => patchClinical("lifestyle", "sleepQualityNotes", value)}
            />
            <SelectNotes
              selectLabel="Tobacco use"
              notesLabel="Tobacco use — notes"
              options={SMOKING_OPTIONS}
              code={clinical.lifestyle.smoking}
              notes={clinical.lifestyle.smokingNotes}
              disabled={!allowManage}
              onCode={(value) => patchClinical("lifestyle", "smoking", value)}
              onNotes={(value) => patchClinical("lifestyle", "smokingNotes", value)}
            />
            <SelectNotes
              selectLabel="Alcohol use"
              notesLabel="Alcohol use — notes"
              options={ALCOHOL_OPTIONS}
              code={clinical.lifestyle.alcohol}
              notes={clinical.lifestyle.alcoholNotes}
              disabled={!allowManage}
              onCode={(value) => patchClinical("lifestyle", "alcohol", value)}
              onNotes={(value) => patchClinical("lifestyle", "alcoholNotes", value)}
            />
            <SelectNotes
              selectLabel="Household status"
              notesLabel="Household status — notes"
              options={HOUSEHOLD_OPTIONS}
              code={clinical.lifestyle.maritalStatus}
              notes={clinical.lifestyle.maritalStatusNotes}
              disabled={!allowManage}
              onCode={(value) => patchClinical("lifestyle", "maritalStatus", value)}
              onNotes={(value) => patchClinical("lifestyle", "maritalStatusNotes", value)}
            />
            <SelectNotes
              selectLabel="Movement & activity"
              notesLabel="Activity — notes"
              options={ACTIVITY_OPTIONS}
              code={clinical.lifestyle.physicalActivity}
              notes={clinical.lifestyle.physicalActivityNotes}
              disabled={!allowManage}
              onCode={(value) => patchClinical("lifestyle", "physicalActivity", value)}
              onNotes={(value) => patchClinical("lifestyle", "physicalActivityNotes", value)}
            />
            <SelectNotes
              selectLabel="Cultural / ethnic background"
              notesLabel="Background — notes"
              options={BACKGROUND_OPTIONS}
              code={clinical.lifestyle.background}
              notes={clinical.lifestyle.other}
              disabled={!allowManage}
              onCode={(value) => patchClinical("lifestyle", "background", value)}
              onNotes={(value) => patchClinical("lifestyle", "other", value)}
            />
          </ClinicalBlock>

          <ClinicalBlock title="Health history">
            <SelectNotes
              selectLabel="Current conditions"
              notesLabel="Conditions — notes"
              options={CONDITION_OPTIONS}
              code={clinical.health.conditions}
              notes={clinical.health.conditionsNotes}
              disabled={!allowManage}
              onCode={(value) => patchClinical("health", "conditions", value)}
              onNotes={(value) => patchClinical("health", "conditionsNotes", value)}
            />
            <Field label="Current medication">
              <Input
                value={clinical.health.medication}
                disabled={!allowManage}
                placeholder="Write here..."
                onChange={(event) => patchClinical("health", "medication", event.target.value)}
              />
            </Field>
            <Field label="Personal health background">
              <Input
                value={clinical.health.personalHistory}
                disabled={!allowManage}
                placeholder="Write here..."
                onChange={(event) => patchClinical("health", "personalHistory", event.target.value)}
              />
            </Field>
            <Field label="Family health background">
              <Input
                value={clinical.health.familyHistory}
                disabled={!allowManage}
                placeholder="Write here..."
                onChange={(event) => patchClinical("health", "familyHistory", event.target.value)}
              />
            </Field>
            <Field label="Additional health notes">
              <Textarea
                value={clinical.health.other}
                disabled={!allowManage}
                placeholder="Write here..."
                onChange={(event) => patchClinical("health", "other", event.target.value)}
              />
            </Field>
          </ClinicalBlock>

          <ClinicalBlock title="Eating patterns">
            <Field label="Typical wake time">
              <Input
                type="time"
                value={clinical.eating.usualWakeTime}
                disabled={!allowManage}
                onChange={(event) => patchClinical("eating", "usualWakeTime", event.target.value)}
              />
            </Field>
            <Field label="Typical sleep time">
              <Input
                type="time"
                value={clinical.eating.usualBedTime}
                disabled={!allowManage}
                onChange={(event) => patchClinical("eating", "usualBedTime", event.target.value)}
              />
            </Field>
            <SelectNotes
              selectLabel="Eating pattern / diet style"
              notesLabel="Diet style — notes"
              options={DIET_STYLE_OPTIONS}
              code={clinical.eating.dietTypes}
              notes={clinical.eating.dietTypesNotes}
              disabled={!allowManage}
              onCode={(value) => patchClinical("eating", "dietTypes", value)}
              onNotes={(value) => patchClinical("eating", "dietTypesNotes", value)}
            />
            <Field label="Foods they enjoy">
              <Input
                value={clinical.eating.preferredFoods}
                disabled={!allowManage}
                placeholder="Write here..."
                onChange={(event) => patchClinical("eating", "preferredFoods", event.target.value)}
              />
            </Field>
            <Field label="Foods they avoid">
              <Input
                value={clinical.eating.dislikedFoods}
                disabled={!allowManage}
                placeholder="Write here..."
                onChange={(event) => patchClinical("eating", "dislikedFoods", event.target.value)}
              />
            </Field>
            <SelectNotes
              selectLabel="Known allergies"
              notesLabel="Allergies — notes"
              options={ALLERGY_OPTIONS}
              code={clinical.eating.allergies}
              notes={clinical.eating.allergiesNotes}
              disabled={!allowManage}
              onCode={(value) => patchClinical("eating", "allergies", value)}
              onNotes={(value) => patchClinical("eating", "allergiesNotes", value)}
            />
            <SelectNotes
              selectLabel="Food intolerances"
              notesLabel="Intolerances — notes"
              options={INTOLERANCE_OPTIONS}
              code={clinical.eating.intolerances}
              notes={clinical.eating.intolerancesNotes}
              disabled={!allowManage}
              onCode={(value) => patchClinical("eating", "intolerances", value)}
              onNotes={(value) => patchClinical("eating", "intolerancesNotes", value)}
            />
          </ClinicalBlock>

          <ClinicalBlock title="Nutrition profile">
            <div className="ui-clinical-targets">
              <p className="ui-clinical-targets__title">Daily macro targets</p>
              <p className="ui-muted ui-clinical-targets__hint">
                Used in Nutrition → Analysis to show whether the day is under, on, or over target.
              </p>
              <div className="ui-clinical-targets__grid">
                <Field label="Energy (kcal)">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="decimal"
                    disabled={!allowManage}
                    value={clinical.nutrition.targets.energyKcal ?? ""}
                    placeholder="e.g. 2000"
                    onChange={(event) => patchNutritionTarget("energyKcal", event.target.value)}
                  />
                </Field>
                <Field label="Protein (g)">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="decimal"
                    disabled={!allowManage}
                    value={clinical.nutrition.targets.proteinG ?? ""}
                    placeholder="e.g. 90"
                    onChange={(event) => patchNutritionTarget("proteinG", event.target.value)}
                  />
                </Field>
                <Field label="Fat (g)">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="decimal"
                    disabled={!allowManage}
                    value={clinical.nutrition.targets.fatG ?? ""}
                    placeholder="e.g. 70"
                    onChange={(event) => patchNutritionTarget("fatG", event.target.value)}
                  />
                </Field>
                <Field label="Carbs (g)">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="decimal"
                    disabled={!allowManage}
                    value={clinical.nutrition.targets.carbohydrateG ?? ""}
                    placeholder="e.g. 260"
                    onChange={(event) => patchNutritionTarget("carbohydrateG", event.target.value)}
                  />
                </Field>
                <Field label="Fiber (g)">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="decimal"
                    disabled={!allowManage}
                    value={clinical.nutrition.targets.fiberG ?? ""}
                    placeholder="e.g. 28"
                    onChange={(event) => patchNutritionTarget("fiberG", event.target.value)}
                  />
                </Field>
              </div>
            </div>
            <SelectNotes
              selectLabel="Nutrient gaps"
              notesLabel="Nutrient gaps — notes"
              options={DEFICIENCY_OPTIONS}
              code={clinical.nutrition.deficiencies}
              notes={clinical.nutrition.deficienciesNotes}
              disabled={!allowManage}
              onCode={(value) => patchClinical("nutrition", "deficiencies", value)}
              onNotes={(value) => patchClinical("nutrition", "deficienciesNotes", value)}
            />
            <Field label="Typical fluid intake">
              <Select
                value={clinical.nutrition.waterIntake}
                disabled={!allowManage}
                onChange={(event) => patchClinical("nutrition", "waterIntake", event.target.value)}
              >
                {WATER_OPTIONS.map((option) => (
                  <option key={option.value || "blank"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Additional nutrition notes">
              <Textarea
                value={clinical.nutrition.other}
                disabled={!allowManage}
                placeholder="Write here..."
                onChange={(event) => patchClinical("nutrition", "other", event.target.value)}
              />
            </Field>
          </ClinicalBlock>

          <ClinicalBlock
            title="Pregnancy notes"
            actions={
              allowManage ? (
                <RailAddButton label="Add pregnancy note" onClick={() => setPregnancyOpen(true)} />
              ) : undefined
            }
          >
            <NoteList
              rows={pregnancyNotes}
              empty="No pregnancy notes logged yet"
              allowManage={allowManage}
              onRemove={(id) => void removeNote(id)}
            />
          </ClinicalBlock>
        </form>
      </div>
      </div>

      <aside
        className={`ui-clinical__rail${railHint.above ? " is-more-above" : ""}${railHint.below ? " is-more-below" : ""}`}
        aria-label="Chart shortcuts"
      >
        <div className="ui-clinical__rail-scroll" ref={railHint.ref}>
        <section className="ui-clinical-rail">
          <header className="ui-clinical-rail__head">
            <h3>Clinical notes</h3>
            {allowManage ? (
              <RailAddButton
                label="Add clinical note"
                onClick={() => {
                  setClinicalNoteDate(localDateInputValue());
                  setClinicalNoteOpen(true);
                }}
              />
            ) : null}
          </header>
          <NoteList
            rows={clinicalNotes}
            empty="No chart notes yet"
            allowManage={allowManage}
            onRemove={(id) => void removeNote(id)}
          />
        </section>

        <section className="ui-clinical-rail">
          <header className="ui-clinical-rail__head">
            <h3>Meal notes</h3>
            {allowManage ? (
              <RailAddButton
                label="Add meal note"
                onClick={() => {
                  setMealNoteDate(localDateInputValue());
                  setMealNoteOpen(true);
                }}
              />
            ) : null}
          </header>
          <NoteList
            rows={mealNotes}
            empty="No meal notes yet"
            allowManage={allowManage}
            onRemove={(id) => void removeNote(id)}
            meal
          />
        </section>

        <section className="ui-clinical-rail">
          <header className="ui-clinical-rail__head">
            <h3>Eating habits</h3>
            {allowManage ? (
              <RailAddButton
                label="Add eating habit"
                onClick={() => {
                  setHabitNoteDate(localDateInputValue());
                  setHabitNoteOpen(true);
                }}
              />
            ) : null}
          </header>
          <NoteList
            rows={habitNotes}
            empty="No eating-habit notes yet"
            allowManage={allowManage}
            onRemove={(id) => void removeNote(id)}
          />
        </section>

        <section className="ui-clinical-rail">
          <header className="ui-clinical-rail__head">
            <h3>Document</h3>
            {allowManage ? (
              <RailAddButton label="Add document" onClick={() => setDocumentOpen(true)} />
            ) : null}
          </header>
          <DocumentsLibrary
            variant="clinic"
            compact
            hideUpload
            title="Document"
            description="PDF, Word, or TXT on this chart."
            accept={CLINICAL_FILE_ACCEPT}
            uploadHint={CLINICAL_FILE_HINT}
            assertFile={assertClinicalDocumentFile}
            documents={documents}
            uploading={uploading}
            downloadingId={downloadingId}
            onUpload={async (file, visibility) => {
              setUploading(true);
              try {
                const body = new FormData();
                body.append("file", file);
                body.append("visibility", visibility);
                const res = await fetch(apiUrl(`${base}/documents`), {
                  method: "POST",
                  body,
                  credentials: "include",
                });
                if (!res.ok) {
                  throw new Error(
                    res.status === 413
                      ? "File exceeds the 20 MB limit"
                      : res.status === 415
                        ? "Use a PDF, Word, or TXT file"
                        : "Upload failed",
                  );
                }
                await loadDocuments();
                setDocumentOpen(false);
              } catch (err) {
                onError(errorMessage(err, "Unable to upload document"));
                throw err;
              } finally {
                setUploading(false);
              }
            }}
            onDownload={async (doc) => {
              setDownloadingId(doc.id);
              try {
                await downloadAuthenticatedFile(apiUrl(`${base}/documents/${doc.id}/download`), doc.filename);
              } catch (err) {
                onError(errorMessage(err, "Unable to download document"));
              } finally {
                setDownloadingId(null);
              }
            }}
          />
        </section>

        <section className="ui-clinical-rail">
          <header className="ui-clinical-rail__head">
            <h3>Goals</h3>
            {allowManage ? <RailAddButton label="Add goal" onClick={() => setGoalOpen(true)} /> : null}
          </header>
          {goals.length === 0 ? (
            <EmptyState title="No goals defined yet" />
          ) : (
            <ul className="ui-clinical-rail__list">
              {goals.map((goal) => (
                <li key={goal.id}>
                  <div className="ui-clinical-rail__copy">
                    <div className="ui-clinical-rail__title-row">
                      <strong>{goal.title}</strong>
                      <StatusBadge status={goal.status} label={humanizeLabel(goal.status)} />
                    </div>
                    {goal.description ? <p>{goal.description}</p> : null}
                    <div className="ui-clinical-rail__meta">
                      <span className="ui-muted">
                        {goal.targetDate ? `By ${formatDateOnly(goal.targetDate)}` : "No deadline"}
                      </span>
                      {goal.status === "ACTIVE" && allowManage ? (
                        <div className="ui-clinical-rail__actions ui-clinical-rail__actions--text">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              void api(`${base}/goals/${goal.id}/complete`, { method: "POST" })
                                .then(() => Promise.all([loadGoals(), onPortfolioRefresh()]))
                                .catch((err) => onError(errorMessage(err, "Unable to complete goal")));
                            }}
                          >
                            Done
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              void api(`${base}/goals/${goal.id}/cancel`, { method: "POST" })
                                .then(() => Promise.all([loadGoals(), onPortfolioRefresh()]))
                                .catch((err) => onError(errorMessage(err, "Unable to cancel goal")));
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ui-clinical-rail">
          <header className="ui-clinical-rail__head">
            <h3>Tags</h3>
            {allowManage ? <RailAddButton label="Edit tags" onClick={() => setTagsOpen(true)} /> : null}
          </header>
          {client.tags.length === 0 ? (
            <EmptyState title="No tags assigned" />
          ) : (
            <div className="ui-clinical-tags">
              {client.tags.map((tag) => (
                <Badge key={tag.id} tone="neutral">
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </section>
        </div>
      </aside>

      <Dialog open={clinicalNoteOpen} title="Add clinical note" onClose={() => setClinicalNoteOpen(false)}>
        <form
          className="ui-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void addNote("CLINICAL", clinicalNote, undefined, clinicalNoteDate);
          }}
        >
          <Field label="Date">
            <Input
              type="date"
              value={clinicalNoteDate}
              required
              onChange={(event) => setClinicalNoteDate(event.target.value)}
            />
          </Field>
          <Field label="Note">
            <Textarea
              value={clinicalNote}
              placeholder="Add a chart note…"
              onChange={(event) => setClinicalNote(event.target.value)}
            />
          </Field>
          <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setClinicalNoteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={noteBusy || !clinicalNote.trim()}>
              Save note
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={mealNoteOpen} title="Add meal note" onClose={() => setMealNoteOpen(false)}>
        <form
          className="ui-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void addNote("MEAL", mealNote, mealSlot, mealNoteDate);
          }}
        >
          <Field label="Date">
            <Input
              type="date"
              value={mealNoteDate}
              required
              onChange={(event) => setMealNoteDate(event.target.value)}
            />
          </Field>
          <Field label="Meal">
            <Select value={mealSlot} onChange={(event) => setMealSlot(event.target.value)}>
              {MEAL_SLOT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note">
            <Textarea
              value={mealNote}
              placeholder="What did they eat, and any comments…"
              onChange={(event) => setMealNote(event.target.value)}
            />
          </Field>
          <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setMealNoteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={noteBusy || !mealNote.trim()}>
              Save meal note
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={habitNoteOpen} title="Add eating habit" onClose={() => setHabitNoteOpen(false)}>
        <form
          className="ui-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void addNote("EATING_HABIT", habitNote, undefined, habitNoteDate);
          }}
        >
          <Field label="Date">
            <Input
              type="date"
              value={habitNoteDate}
              required
              onChange={(event) => setHabitNoteDate(event.target.value)}
            />
          </Field>
          <Field label="Note">
            <Textarea
              value={habitNote}
              placeholder="Pace, skipping meals, snacking patterns…"
              onChange={(event) => setHabitNote(event.target.value)}
            />
          </Field>
          <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setHabitNoteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={noteBusy || !habitNote.trim()}>
              Save habit note
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={pregnancyOpen} title="Add pregnancy note" onClose={() => setPregnancyOpen(false)}>
        <form
          className="ui-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void addNote("PREGNANCY", pregnancyNote);
          }}
        >
          <Field label="Note">
            <Textarea
              value={pregnancyNote}
              placeholder="Add a pregnancy-related note…"
              onChange={(event) => setPregnancyNote(event.target.value)}
            />
          </Field>
          <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setPregnancyOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={noteBusy || !pregnancyNote.trim()}>
              Save record
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={documentOpen} title="Add a document" onClose={() => setDocumentOpen(false)}>
        <DocumentsLibrary
          variant="clinic"
          uploadOnly
          accept={CLINICAL_FILE_ACCEPT}
          uploadHint={CLINICAL_FILE_HINT}
          assertFile={assertClinicalDocumentFile}
          documents={[]}
          uploading={uploading}
          onUpload={async (file, visibility) => {
            setUploading(true);
            try {
              const body = new FormData();
              body.append("file", file);
              body.append("visibility", visibility);
              const res = await fetch(apiUrl(`${base}/documents`), {
                method: "POST",
                body,
                credentials: "include",
              });
              if (!res.ok) {
                throw new Error(
                  res.status === 413
                    ? "File exceeds the 20 MB limit"
                    : res.status === 415
                      ? "Use a PDF, Word, or TXT file"
                      : "Upload failed",
                );
              }
              await loadDocuments();
              setDocumentOpen(false);
            } catch (err) {
              onError(errorMessage(err, "Unable to upload document"));
              throw err;
            } finally {
              setUploading(false);
            }
          }}
          onDownload={async () => undefined}
        />
      </Dialog>

      <Dialog open={goalOpen} title="Set a new goal" onClose={() => setGoalOpen(false)}>
        <form className="ui-stack" onSubmit={(event) => void addGoal(event)}>
          <Field label="Title">
            <Input
              value={goalTitle}
              required
              minLength={2}
              placeholder="Goal title"
              onChange={(event) => setGoalTitle(event.target.value)}
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={goalDescription}
              placeholder="What success looks like…"
              onChange={(event) => setGoalDescription(event.target.value)}
            />
          </Field>
          <Field label="Deadline">
            <Input type="date" value={goalDeadline} onChange={(event) => setGoalDeadline(event.target.value)} />
          </Field>
          <div className="ui-row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setGoalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!goalTitle.trim()}>
              Set goal
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={tagsOpen} title="Client tags" onClose={() => setTagsOpen(false)}>
        <div className="ui-client-tags">
          <ClinicTagsManager
            dietitianAccountId={dietitianAccountId}
            tags={orgTags}
            disabled={!allowManage}
            compact
            onChange={(next) => {
              onOrgTagsChange(next);
              onSelectedTagIdsChange(selectedTagIds.filter((id) => next.some((tag) => tag.id === id)));
              void onPortfolioRefresh();
            }}
          />
          {orgTags.length > 0 ? (
            <form
              className="ui-client-tags__assign"
              onSubmit={(event) => {
                event.preventDefault();
                void api(`${orgBase}/clients/${clientId}/tags`, {
                  method: "PUT",
                  body: JSON.stringify({ tagIds: selectedTagIds }),
                })
                  .then(() => onPortfolioRefresh())
                  .catch((err) => onError(errorMessage(err, "Unable to save tags")));
              }}
            >
              <p className="ui-client-tags__assign-label">Assigned to this client</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                {orgTags.map((tag) => (
                  <Checkbox
                    key={tag.id}
                    label={tag.name}
                    checked={selectedTagIds.includes(tag.id)}
                    disabled={!allowManage}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      onSelectedTagIdsChange(
                        checked ? [...selectedTagIds, tag.id] : selectedTagIds.filter((id) => id !== tag.id),
                      );
                    }}
                  />
                ))}
              </div>
              <Button type="submit" size="sm" variant="secondary" disabled={!allowManage}>
                Save tags
              </Button>
            </form>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
