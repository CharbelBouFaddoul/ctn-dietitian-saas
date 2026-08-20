export default function HowItWorksPage() {
  return (
    <section className="ui-mkt__section">
      <h1>How it works</h1>
      <p className="ui-muted" style={{ maxWidth: 640 }}>
        Built around the way a nutrition practice actually runs — not around technical roles.
      </p>
      <ol className="ui-stack" style={{ marginTop: 32, paddingLeft: 20, maxWidth: 680 }}>
        <li>
          <strong>You start the practice.</strong> Create an account, verify your email, and open your workspace.
        </li>
        <li>
          <strong>Clients create their own login.</strong> You share a practice join code — they enter it after signing
          in.
        </li>
        <li>
          <strong>They appear on your client list.</strong> You assign care, publish a meal plan, and follow tracking.
        </li>
        <li>
          <strong>Everyone stays in the same conversation.</strong> Messages, documents, and invoices live with the
          client record.
        </li>
      </ol>
    </section>
  );
}
