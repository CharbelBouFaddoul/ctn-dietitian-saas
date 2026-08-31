import Link from "next/link";

const STEPS = [
  {
    title: "Get your clinic set up",
    body: "Choose a plan and contact us to get started, or self-register when registration is open. Your subscription and workspace are activated so you can begin seeing clients.",
    visual: { title: "Clinic ready", detail: "Plan · workspace · sign in" },
  },
  {
    title: "Add your clients",
    body: "Build charts manually when needed, or wait for patients to join through your clinic code.",
    visual: { title: "Client roster", detail: "Search · tags · status" },
  },
  {
    title: "Create a clinic join code",
    body: "Generate a short clinic code from your clients area and share it with the people you work with.",
    visual: { title: "Join code", detail: "Short · secure · shareable" },
  },
  {
    title: "Client creates their own account",
    body: "Patients register with their own email and password — you do not invent passwords for them.",
    visual: { title: "Patient account", detail: "Self-serve registration" },
  },
  {
    title: "Client enters the clinic code",
    body: "After sign-in, they enter the code once. That connects their account to your clinic roster.",
    visual: { title: "Connect", detail: "Code → correct clinic" },
  },
  {
    title: "Dietitian and client are connected",
    body: "They appear on your client list. You can manage their chart, meal plans, messages, documents, and assessments.",
    visual: { title: "Linked chart", detail: "Portal + clinic in sync" },
  },
  {
    title: "Manage the nutrition journey together",
    body: "Publish meal plans, review tracking, schedule appointments, message, invoice, and keep care organized — with optional AI and automations on eligible plans.",
    visual: { title: "Shared care", detail: "Plan · track · message" },
  },
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--hero">
        <div className="ui-mkt__hero">
          <p className="ui-eyebrow">How it works</p>
          <h1>How dietitians and patients connect.</h1>
          <p>
            Follow the path from opening your clinic to ongoing shared care — connected by a short clinic join code,
            not complicated invitation links.
          </p>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--mint">
        <div className="ui-mkt__section">
          <div className="ui-mkt__section-head">
            <p className="ui-eyebrow">Connected workflow</p>
            <h2>One journey from setup to care.</h2>
          </div>

          <div className="ui-mkt__journey">
            {STEPS.map((step, index) => (
              <article key={step.title} className="ui-mkt__journey-step">
                <div className="ui-mkt__journey-marker">{String(index + 1).padStart(2, "0")}</div>
                <div className="ui-mkt__journey-copy">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
                <div className="ui-mkt__journey-visual">
                  <strong>{step.visual.title}</strong>
                  {step.visual.detail}
                </div>
              </article>
            ))}
          </div>

          <div className="ui-mkt__code-visual" role="note">
            <span>Clinic join code</span>
            <strong>NUTR-4821</strong>
            <span>Example format — your live code is generated in the clinic app.</span>
          </div>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--warm">
        <div className="ui-mkt__section">
          <div className="ui-mkt__section-head">
            <p className="ui-eyebrow">Two perspectives</p>
            <h2>What each side does day to day.</h2>
          </div>
          <div className="ui-mkt__split">
            <article className="ui-mkt__experience ui-mkt__experience--dietitian">
              <h3>Dietitian</h3>
              <ul>
                <li>Run the clinic dashboard and client charts</li>
                <li>Build meal plans from foods, recipes, and habits</li>
                <li>Publish plans and review portal tracking</li>
                <li>Run assessments and share documents on each chart</li>
                <li>Message, schedule appointments, and manage invoices</li>
                <li>Use analytics — plus AI and automations when your plan includes them</li>
              </ul>
              <Link href="/contact" className="ui-link">
                Contact us →
              </Link>
            </article>
            <article className="ui-mkt__experience ui-mkt__experience--patient">
              <h3>Patient</h3>
              <ul>
                <li>Create a personal account</li>
                <li>Enter the clinic join code</li>
                <li>View the published meal plan</li>
                <li>Log food on the daily log (search, portions, nutrition facts)</li>
                <li>Track water, exercise, sleep, and habits</li>
                <li>Complete custom forms and message your dietitian</li>
                <li>Request visits, and view documents and invoices</li>
              </ul>
              <Link href="/auth/client/login" className="ui-link">
                Patient sign in →
              </Link>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
