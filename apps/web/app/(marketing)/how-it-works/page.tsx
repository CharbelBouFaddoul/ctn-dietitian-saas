import Link from "next/link";

const STEPS = [
  {
    title: "Create your practice",
    body: "Register as a dietitian, verify your email, and open your practice workspace.",
    visual: { title: "Practice account", detail: "Email verified · workspace ready" },
  },
  {
    title: "Add your clients",
    body: "Build charts manually when needed, or wait for patients to join through your practice code.",
    visual: { title: "Client roster", detail: "Search · tags · status" },
  },
  {
    title: "Create a client join code",
    body: "Generate a short practice code from your clients area and share it with the people you work with.",
    visual: { title: "Join code", detail: "Short · secure · shareable" },
  },
  {
    title: "Client creates their own account",
    body: "Patients register with their own email and password — you do not invent passwords for them.",
    visual: { title: "Patient account", detail: "Self-serve registration" },
  },
  {
    title: "Client enters the practice code",
    body: "After sign-in, they enter the code once. That connects their account to your practice roster.",
    visual: { title: "Connect", detail: "Code → correct practice" },
  },
  {
    title: "Dietitian and client are connected",
    body: "They appear on your client list. You can manage their chart, plans, messages, and documents.",
    visual: { title: "Linked chart", detail: "Portal + practice in sync" },
  },
  {
    title: "Manage the nutrition journey together",
    body: "Publish meal plans, review tracking, communicate, and keep care organized in one place.",
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
            Follow the path from opening your practice to ongoing shared care — connected by a short practice join code,
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
            <span>Practice join code</span>
            <strong>NUTR-4821</strong>
            <span>Example format — your live code is generated in the practice app.</span>
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
                <li>Create and manage the practice</li>
                <li>Add and organize clients</li>
                <li>Build and publish meal plans</li>
                <li>Review tracking and progress</li>
                <li>Message and share documents</li>
                <li>Run appointments, tasks, invoices, and analytics</li>
              </ul>
              <Link href="/auth/dietitian/register" className="ui-link">
                Create practice account →
              </Link>
            </article>
            <article className="ui-mkt__experience ui-mkt__experience--patient">
              <h3>Patient</h3>
              <ul>
                <li>Create a personal account</li>
                <li>Enter the practice join code</li>
                <li>Connect to the correct dietitian</li>
                <li>Access the published meal plan</li>
                <li>Track food, water, exercise, sleep, and habits</li>
                <li>Message and view shared documents &amp; invoices</li>
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
