"use client";

import Link from "next/link";

export function LegalConsentCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="ui-check ui-auth__legal-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} required />
      <span>
        I agree to the{" "}
        <Link href="/terms" className="ui-link" target="_blank" rel="noreferrer">
          Terms of use
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="ui-link" target="_blank" rel="noreferrer">
          Privacy policy
        </Link>
        .
      </span>
    </label>
  );
}
