export default function PricingPage() {
  return (
    <section className="ui-mkt__section">
      <h1>Pricing</h1>
      <p className="ui-muted" style={{ maxWidth: 640 }}>
        One subscription per practice. Features such as AI assistance can be included in your plan. We’ll match a plan
        to the size of your clinic.
      </p>
      <div className="ui-grid" style={{ marginTop: 28 }}>
        <article className="ui-card">
          <h2 className="ui-card__title">Practice</h2>
          <p className="ui-muted">Client records, meal plans, tracking, messaging, documents, invoices, and tasks.</p>
        </article>
        <article className="ui-card">
          <h2 className="ui-card__title">Practice + AI</h2>
          <p className="ui-muted">
            Draft summaries and suggestions you review before anything reaches a client. Usage is limited by plan.
          </p>
        </article>
      </div>
      <p style={{ marginTop: 24 }}>
        <a className="ui-btn ui-btn--primary" href="/contact">
          Talk to us
        </a>
      </p>
    </section>
  );
}
