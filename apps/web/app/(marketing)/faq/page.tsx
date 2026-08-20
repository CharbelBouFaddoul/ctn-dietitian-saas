const FAQS = [
  {
    q: "Who is this for?",
    a: "Dietitians and nutrition practices who want a calm workspace for client care. Clients use a simple portal after they join your practice.",
  },
  {
    q: "How do clients join?",
    a: "They create their own account, verify email, then enter a practice join code you share. They then appear on your client list.",
  },
  {
    q: "Can I add a client chart myself?",
    a: "Yes. Manual charts are available for records that are not using the portal yet. Inviting with a join code is the usual path.",
  },
  {
    q: "Do clients see my whole practice?",
    a: "No. Clients only see their own plan, tracking, messages, documents, and invoices.",
  },
];

export default function FaqPage() {
  return (
    <section className="ui-mkt__section">
      <h1>FAQ</h1>
      <div className="ui-stack" style={{ marginTop: 24, maxWidth: 720 }}>
        {FAQS.map((item) => (
          <article key={item.q} className="ui-card">
            <h2 className="ui-card__title">{item.q}</h2>
            <p className="ui-muted">{item.a}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
