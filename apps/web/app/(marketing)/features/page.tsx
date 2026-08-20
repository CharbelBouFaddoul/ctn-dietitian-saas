const FEATURES = [
  { title: "Client workspace", body: "Profile, goals, measurements, assessments, and portal connection in one chart." },
  { title: "Meal plans & recipes", body: "Draft, publish, and keep history. Clients only see the current published plan." },
  { title: "Tracking", body: "Food, water, exercise, sleep, and habits — reviewed in context, not as a spreadsheet dump." },
  { title: "Messaging & documents", body: "Stay in the thread with the people you care for, and share files when needed." },
  { title: "Invoices & tasks", body: "Keep follow-ups and outstanding invoices visible without leaving the practice." },
  { title: "Automations & AI assist", body: "Optional reminders and draft suggestions. You stay in control of every send and edit." },
];

export default function FeaturesPage() {
  return (
    <section className="ui-mkt__section">
      <h1>Features</h1>
      <p className="ui-muted">Everything a growing nutrition practice needs to stay organized.</p>
      <div className="ui-grid" style={{ marginTop: 28 }}>
        {FEATURES.map((feature) => (
          <article key={feature.title} className="ui-card">
            <h2 className="ui-card__title">{feature.title}</h2>
            <p className="ui-muted">{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
