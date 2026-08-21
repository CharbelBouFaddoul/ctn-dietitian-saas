"use client";

import { Button, EmptyState, Field, Section, Textarea } from "@nutrition-saas/ui";
import { formatDate } from "../lib/format";
import { activityLabel } from "../lib/practice-labels";

export type TimelineEventRow = {
  id: string;
  type: string;
  occurredAt: string;
  targetType: string | null;
  targetId: string | null;
};

type Props = {
  notes: string;
  onNotesChange: (value: string) => void;
  onSaveNotes: () => void;
  allowManage: boolean;
  events: TimelineEventRow[];
  loading: boolean;
  page: number;
  hasNewer: boolean;
  hasOlder: boolean;
  onNewer: () => void;
  onOlder: () => void;
};

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function formatDayHeading(isoDay: string) {
  const [y, m, d] = isoDay.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (isoDay === todayKey) return "Today";
  if (isoDay === yesterdayKey) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupEvents(events: TimelineEventRow[]) {
  const groups: Array<{ day: string; items: TimelineEventRow[] }> = [];
  const index = new Map<string, number>();
  for (const event of events) {
    const day = dayKey(event.occurredAt);
    const existing = index.get(day);
    if (existing == null) {
      index.set(day, groups.length);
      groups.push({ day, items: [event] });
    } else {
      groups[existing]!.items.push(event);
    }
  }
  return groups;
}

export function ClientTimelinePanel({
  notes,
  onNotesChange,
  onSaveNotes,
  allowManage,
  events,
  loading,
  page,
  hasNewer,
  hasOlder,
  onNewer,
  onOlder,
}: Props) {
  const groups = groupEvents(events);
  const showPager = hasNewer || hasOlder || page > 1;

  return (
    <div className="ui-chart-timeline">
      <div className="ui-chart-timeline__layout">
        <section className="ui-chart-timeline__feed">
          <header className="ui-chart-timeline__feed-head">
            <div>
              <p className="ui-chart-timeline__eyebrow">Activity</p>
              <h2 className="ui-chart-timeline__title">Timeline</h2>
              <p className="ui-muted ui-chart-timeline__hint">
                Chart events for this client — logs, goals, appointments, and care updates.
              </p>
            </div>
          </header>

          {events.length === 0 && !loading ? (
            <EmptyState title="No timeline events yet">
              Activity will appear here as the chart is used.
            </EmptyState>
          ) : (
            <>
              <div className="ui-chart-timeline__scroll">
                <div className="ui-chart-timeline__groups">
                  {groups.map((group) => (
                    <div key={group.day} className="ui-chart-timeline__day">
                      <h3 className="ui-chart-timeline__day-label">{formatDayHeading(group.day)}</h3>
                      <ol className="ui-chart-timeline__rail">
                        {group.items.map((row) => (
                          <li key={row.id} className="ui-chart-timeline__event">
                            <div className="ui-chart-timeline__dot" aria-hidden="true" />
                            <div className="ui-chart-timeline__event-body">
                              <p className="ui-chart-timeline__event-title">{activityLabel(row.type)}</p>
                              <time className="ui-chart-timeline__event-time" dateTime={row.occurredAt}>
                                {formatTime(row.occurredAt)}
                                <span className="ui-chart-timeline__event-sep">·</span>
                                {formatDate(row.occurredAt)}
                              </time>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
              {showPager ? (
                <div className="ui-chart-timeline__pager">
                  <span className="ui-muted">Page {page}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={loading || !hasNewer}
                    onClick={onNewer}
                  >
                    Newer
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={loading || !hasOlder}
                    onClick={onOlder}
                  >
                    {loading ? "Loading…" : "Older"}
                  </Button>
                </div>
              ) : null}
            </>
          )}

          {loading && events.length === 0 ? (
            <p className="ui-muted" style={{ margin: 0 }}>
              Loading timeline…
            </p>
          ) : null}
        </section>

        <aside className="ui-chart-timeline__aside">
          <Section title="Clinical notes" description="Private clinic notes on this chart. Not shown in the patient portal.">
            <form
              className="ui-chart-timeline__notes-form"
              onSubmit={(event) => {
                event.preventDefault();
                onSaveNotes();
              }}
            >
              <Field label="Notes">
                <Textarea
                  value={notes}
                  onChange={(event) => onNotesChange(event.target.value)}
                  style={{ minHeight: 160 }}
                  disabled={!allowManage}
                  placeholder="Session context, observations, follow-ups…"
                />
              </Field>
              <Button type="submit" size="sm" variant="secondary" disabled={!allowManage}>
                Save notes
              </Button>
            </form>
          </Section>
        </aside>
      </div>
    </div>
  );
}
