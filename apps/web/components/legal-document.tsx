import type { ReactNode } from "react";
import Link from "next/link";

export function LegalDocument({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--hero">
        <div className="ui-mkt__hero">
          <p className="ui-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{summary}</p>
        </div>
      </section>
      <section className="ui-mkt__band ui-mkt__band--white">
        <div className="ui-mkt__section" style={{ paddingTop: 0 }}>
          <article className="ui-mkt__legal">{children}</article>
          <p className="ui-mkt__legal-nav">
            <Link href="/privacy" className="ui-link">
              Privacy policy
            </Link>
            <span aria-hidden="true"> · </span>
            <Link href="/terms" className="ui-link">
              Terms of use
            </Link>
            <span aria-hidden="true"> · </span>
            <Link href="/contact" className="ui-link">
              Contact
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
