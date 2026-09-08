type ToggleChipProps = {
  label: string;
  on: boolean;
  onClick: () => void;
  onLabel?: string;
  offLabel?: string;
};

export function ToggleChip({ label, on, onClick, onLabel = "On", offLabel = "Off" }: ToggleChipProps) {
  return (
    <button
      type="button"
      className={`ui-profile-toggle${on ? " is-on" : ""}`}
      aria-pressed={on}
      onClick={onClick}
    >
      <span className="ui-profile-toggle__box" aria-hidden="true">
        {on ? (
          <svg viewBox="0 0 16 16" width="12" height="12">
            <path d="M3.5 8.2 6.4 11 12.5 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className="ui-profile-toggle__label">{label}</span>
      <span className="ui-profile-toggle__state">{on ? onLabel : offLabel}</span>
    </button>
  );
}

type ChoiceCardProps = {
  title: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
};

export function ChoiceCard({ title, hint, selected, onClick }: ChoiceCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`ui-profile-choice${selected ? " is-on" : ""}`}
      onClick={onClick}
    >
      <span className="ui-profile-choice__mark" aria-hidden="true" />
      <span className="ui-profile-choice__copy">
        <strong>{title}</strong>
        <span>{hint}</span>
      </span>
    </button>
  );
}

export function RemovableTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="ui-profile-tag">
      <span>{label}</span>
      <button type="button" className="ui-profile-tag__remove" aria-label={`Remove ${label}`} onClick={onRemove}>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}
