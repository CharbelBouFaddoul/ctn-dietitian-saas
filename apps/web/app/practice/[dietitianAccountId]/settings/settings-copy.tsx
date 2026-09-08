import type { ReactNode } from "react";

export function SettingsLead({ children, affects }: { children: ReactNode; affects: string[] }) {
  return (
    <div className="ui-profile-hub__lead">
      <p>{children}</p>
      <SettingsAffects items={affects} />
    </div>
  );
}

export function SettingsAffects({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <span className="ui-profile-hub__affects">
      <span className="ui-profile-hub__affects-label">Used in</span>
      {items.map((item) => (
        <span key={item} className="ui-profile-hub__affects-item">
          {item}
        </span>
      ))}
    </span>
  );
}

export function SettingsNote({ children }: { children: ReactNode }) {
  return <p className="ui-profile-hub__note">{children}</p>;
}
