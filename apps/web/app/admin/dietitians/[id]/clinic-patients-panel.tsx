"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, EmptyState, LoadingState, StatusBadge } from "@nutrition-saas/ui";
import {
  FilterPopover,
  ListFilters,
  LIST_SEARCH_DEBOUNCE_MS,
} from "../../../../components/list-filters";
import { scopedStatusLabel } from "../../../../lib/admin-labels";
import { formatDate } from "../../../../lib/format";

export interface ClinicPatient {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  isTrialSeed: boolean;
  createdAt: string;
  portalUser: {
    id: string;
    email: string;
    status: string;
    accountStatus: string;
  } | null;
}

const CHART_STATUSES = [
  { id: "", label: "All statuses" },
  { id: "ACTIVE", label: "Active" },
  { id: "PENDING", label: "Pending" },
  { id: "INACTIVE", label: "Inactive" },
  { id: "ARCHIVED", label: "Archived" },
] as const;

const PORTAL_FILTERS = [
  { id: "", label: "Any portal" },
  { id: "yes", label: "Has portal login" },
  { id: "no", label: "No portal login" },
] as const;

const SAMPLE_FILTERS = [
  { id: "", label: "All charts" },
  { id: "hide", label: "Hide samples" },
  { id: "only", label: "Samples only" },
] as const;

function patientName(row: ClinicPatient): string {
  const named = row.displayName?.trim() || [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return named || "Patient";
}

function contactLine(row: ClinicPatient): string {
  return [row.email || row.portalUser?.email, row.phone].filter(Boolean).join(" · ");
}

export function ClinicPatientsPanel({
  dietitianAccountId,
  patients,
  activeCount,
}: {
  dietitianAccountId: string;
  patients: ClinicPatient[] | null;
  activeCount: number;
}) {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [portal, setPortal] = useState("");
  const [sample, setSample] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchDraft), LIST_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchDraft]);

  const counts = useMemo(() => {
    const rows = patients ?? [];
    return {
      all: rows.length,
      ACTIVE: rows.filter((row) => row.status === "ACTIVE").length,
      PENDING: rows.filter((row) => row.status === "PENDING").length,
      INACTIVE: rows.filter((row) => row.status === "INACTIVE").length,
      ARCHIVED: rows.filter((row) => row.status === "ARCHIVED").length,
      portal: rows.filter((row) => row.portalUser).length,
    };
  }, [patients]);

  const filtered = useMemo(() => {
    if (!patients) return [];
    const needle = search.trim().toLowerCase();
    return patients.filter((row) => {
      if (status && row.status !== status) return false;
      if (portal === "yes" && !row.portalUser) return false;
      if (portal === "no" && row.portalUser) return false;
      if (sample === "hide" && row.isTrialSeed) return false;
      if (sample === "only" && !row.isTrialSeed) return false;
      if (!needle) return true;
      const haystack = [patientName(row), row.email, row.phone, row.portalUser?.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [patients, search, status, portal, sample]);

  const hasFilters = Boolean(searchDraft.trim() || status || portal || sample);
  const statusLabel = CHART_STATUSES.find((item) => item.id === status)?.label;
  const portalLabel = PORTAL_FILTERS.find((item) => item.id === portal)?.label;
  const sampleLabel = SAMPLE_FILTERS.find((item) => item.id === sample)?.label;

  function clearFilters() {
    setSearchDraft("");
    setSearch("");
    setStatus("");
    setPortal("");
    setSample("");
  }

  function toggleStatus(next: string) {
    setStatus((current) => (current === next ? "" : next));
  }

  const metrics = [
    { key: "all", label: "All", value: counts.all, active: !hasFilters, onClick: clearFilters },
    { key: "ACTIVE", label: "Active", value: counts.ACTIVE, active: status === "ACTIVE", onClick: () => toggleStatus("ACTIVE") },
    { key: "PENDING", label: "Pending", value: counts.PENDING, active: status === "PENDING", onClick: () => toggleStatus("PENDING") },
    {
      key: "INACTIVE",
      label: "Inactive",
      value: counts.INACTIVE,
      active: status === "INACTIVE",
      onClick: () => toggleStatus("INACTIVE"),
    },
    {
      key: "ARCHIVED",
      label: "Archived",
      value: counts.ARCHIVED,
      active: status === "ARCHIVED",
      onClick: () => toggleStatus("ARCHIVED"),
    },
    {
      key: "portal",
      label: "With portal",
      value: counts.portal,
      active: portal === "yes",
      onClick: () => setPortal((current) => (current === "yes" ? "" : "yes")),
    },
  ];

  return (
    <div className="ui-admin-roster">
      <div className="ui-admin-roster__head">
        <div>
          <h2>Patients</h2>
          <p>
            {activeCount} active or pending
            {patients && patients.length !== activeCount ? ` · ${patients.length} on this clinic` : ""}
          </p>
        </div>
        <Link
          href={`/admin/users/new?dietitianAccountId=${dietitianAccountId}`}
          className="ui-btn ui-btn--primary ui-btn--sm"
        >
          Add patient
        </Link>
      </div>

      {patients && patients.length > 0 ? (
        <div className="ui-admin-metrics" role="toolbar" aria-label="Filter patients by status">
          {metrics.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`ui-admin-metric${item.active ? " is-active" : ""}`}
              aria-pressed={item.active}
              onClick={item.onClick}
            >
              <span className="ui-admin-metric__label">{item.label}</span>
              <span className="ui-admin-metric__value">{item.value}</span>
            </button>
          ))}
        </div>
      ) : null}

      <ListFilters
        search={searchDraft}
        onSearchChange={setSearchDraft}
        searchPlaceholder="Search name, email, or phone"
        hasFilters={hasFilters}
        onClear={clearFilters}
        count={filtered.length}
        countNoun="patient"
        loading={patients === null}
      >
        <FilterPopover
          label="Filter by chart status"
          value={status ? statusLabel ?? "Status" : "Status"}
          active={Boolean(status)}
          searchPlaceholder="Search status"
          onSelect={setStatus}
          items={CHART_STATUSES.map((item) => ({
            id: item.id,
            label: item.label,
            active: status === item.id,
          }))}
        />
        <FilterPopover
          label="Filter by portal login"
          value={portal ? portalLabel ?? "Portal" : "Portal"}
          active={Boolean(portal)}
          searchPlaceholder="Search portal"
          onSelect={setPortal}
          items={PORTAL_FILTERS.map((item) => ({
            id: item.id,
            label: item.label,
            active: portal === item.id,
          }))}
        />
        <FilterPopover
          label="Filter sample charts"
          value={sample ? sampleLabel ?? "Samples" : "Samples"}
          active={Boolean(sample)}
          searchPlaceholder="Search samples"
          onSelect={setSample}
          items={SAMPLE_FILTERS.map((item) => ({
            id: item.id,
            label: item.label,
            active: sample === item.id,
          }))}
        />
      </ListFilters>

      {patients === null ? <LoadingState>Loading patients…</LoadingState> : null}

      {patients && filtered.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No patients match these filters" : "No patients yet"}
          action={
            hasFilters ? (
              <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={clearFilters}>
                Clear filters
              </button>
            ) : (
              <Link href={`/admin/users/new?dietitianAccountId=${dietitianAccountId}`} className="ui-btn ui-btn--primary ui-btn--sm">
                Add patient
              </Link>
            )
          }
        >
          {hasFilters
            ? "Try a different name, status, or portal filter."
            : "Charts appear when this clinic adds a client or you add one here."}
        </EmptyState>
      ) : null}

      {filtered.length > 0 ? (
        <ul className="ui-list-cards">
          {filtered.map((row) => {
            const name = patientName(row);
            const contact = contactLine(row);
            const href = row.portalUser ? `/admin/users/${row.portalUser.id}` : null;
            const identity = (
              <>
                <div className="ui-admin-roster__name">
                  <strong>{name}</strong>
                  {row.isTrialSeed ? <Badge tone="neutral">Sample</Badge> : null}
                </div>
                <p>{contact || "No email or phone"}</p>
                <p>Added {formatDate(row.createdAt)}</p>
              </>
            );
            return (
              <li key={row.id}>
                <article className="ui-list-cards__item">
                  {href ? (
                    <Link href={href} className="ui-list-cards__main">
                      {identity}
                    </Link>
                  ) : (
                    <div className="ui-list-cards__main">{identity}</div>
                  )}
                  <div className="ui-list-cards__aside">
                    <StatusBadge status={row.status} label={scopedStatusLabel("patient", row.status)} />
                    {row.portalUser ? (
                      <Link href={`/admin/users/${row.portalUser.id}`} className="ui-link">
                        {scopedStatusLabel("login", row.portalUser.status)}
                      </Link>
                    ) : (
                      <span className="ui-muted">No portal login</span>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}

      {patients && patients.length >= 200 ? (
        <p className="ui-muted">Showing the first 200 charts on this clinic.</p>
      ) : null}
    </div>
  );
}
