import Link from "next/link";

const STEPS = [
  {
    title: "Add the client",
    body: "Open a chart, or share a short clinic join code. The patient creates their own account, enters the code once, and appears on your roster. There is no invitation link or shared password.",
    patient: "Creates an account and enters the clinic code.",
  },
  {
    title: "Record care on the chart",
    body: "Notes, measurements, questionnaires, meal plans, and habit protocols stay on the same client record. You do not need to copy the same information into a spreadsheet, a folder, and a message thread.",
    patient: null,
  },
  {
    title: "Publish the plan",
    body: "Share the current meal plan through the patient portal. The patient can see the latest version and log food, water, exercise, sleep, and habits.",
    patient: "Views the plan and records daily tracking.",
  },
  {
    title: "Review progress before the visit",
    body: "Open the chart to see what was logged. You can message the patient if something needs attention, and the appointment can start from that information rather than a verbal recap.",
    patient: "Messages the clinic when needed.",
  },
  {
    title: "Continue in the same workspace",
    body: "Schedule the next appointment and issue an invoice from the same clinic. When a paper copy is needed, you can print or download PDF for the main chart sections: profile, forms, measurements, tracking, prescription, and meal plans.",
    patient: "Views documents and invoices in the portal.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--hero">
        <div className="ui-mkt__hero">
          <p className="ui-eyebrow">How it works</p>
          <h1>How the clinic works.</h1>
          <p>
            Records, meal plans, and follow-up often live in different tools. This workspace keeps them on one client
            record, with a simple portal for patients.
          </p>
          <div className="ui-mkt__hero-ctas">
            <Link href="/auth/dietitian/register" className="ui-btn ui-btn--primary ui-btn--lg">
              Start free trial
            </Link>
            <Link href="/plans" className="ui-btn ui-btn--secondary ui-btn--lg">
              View plans
            </Link>
          </div>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--white">
        <div className="ui-mkt__section">
          <div className="ui-mkt__section-head ui-mkt__section-head--wide">
            <p className="ui-eyebrow">In practice</p>
            <h2>Client information is often split across tools.</h2>
            <p>
              Many dietitians still keep notes in a spreadsheet, send plans by message, and collect progress at the next
              visit. Time is lost finding the latest notes, plan, and updates before each appointment.
            </p>
          </div>
          <div className="ui-mkt__today">
            <article className="ui-mkt__today-col">
              <p className="ui-eyebrow">Common practice</p>
              <h3>Work is spread across tools</h3>
              <ul>
                <li>Notes and measurements in a spreadsheet or on paper</li>
                <li>Meal plans sent by message or email</li>
                <li>Progress reported in photos or at the next visit</li>
                <li>Documents stored in a shared folder</li>
                <li>Appointments and invoices in other applications</li>
              </ul>
            </article>
            <article className="ui-mkt__today-col ui-mkt__today-col--current">
              <p className="ui-eyebrow">On this platform</p>
              <h3>Care stays on one record</h3>
              <ul>
                <li>Notes, forms, and measurements on the client chart</li>
                <li>Meal plans published to the patient portal</li>
                <li>Food and habit logs available before the visit</li>
                <li>Messages and documents on the same chart</li>
                <li>Scheduling and invoicing in the same workspace</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--slate">
        <div className="ui-mkt__section">
          <div className="ui-mkt__section-head ui-mkt__section-head--wide">
            <p className="ui-eyebrow">The process</p>
            <h2>From adding a client to the next appointment.</h2>
            <p>
              Each step is ordinary clinic work. The difference is that it happens on one record, so you are not
              repeating it in another tool.
            </p>
          </div>
          <ol className="ui-mkt__process">
            {STEPS.map((step, index) => (
              <li key={step.title} className="ui-mkt__process-item">
                <span className="ui-mkt__process-num">{String(index + 1).padStart(2, "0")}</span>
                <div className="ui-mkt__process-copy">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
                {step.patient ? (
                  <aside className="ui-mkt__process-side">
                    <p className="ui-mkt__process-side-head">
                      <span className="ui-mkt__process-side-mark" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
                          <circle cx="12" cy="8.2" r="3.1" stroke="currentColor" strokeWidth="1.8" />
                          <path
                            d="M6.4 18.3c1.15-2.35 3.1-3.55 5.6-3.55s4.45 1.2 5.6 3.55"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      Patient
                    </p>
                    <p>{step.patient}</p>
                  </aside>
                ) : (
                  <div className="ui-mkt__process-side ui-mkt__process-side--empty" aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--white">
        <div className="ui-mkt__section">
          <div className="ui-mkt__section-head ui-mkt__section-head--wide">
            <p className="ui-eyebrow">Where time is saved</p>
            <h2>The record is ready when you need it.</h2>
            <p>
              We do not claim a fixed number of hours. The saving is practical: the chart, the current plan, and recent
              logs are already together when you need them.
            </p>
          </div>
          <dl className="ui-mkt__notes">
            <div>
              <dt>Before a visit</dt>
              <dd>Review the chart and tracking instead of gathering files from different places.</dd>
            </div>
            <div>
              <dt>When the plan changes</dt>
              <dd>Publish the update once. The portal shows the current plan, not an older message.</dd>
            </div>
            <div>
              <dt>When a copy is needed</dt>
              <dd>Print or download the main chart sections as PDF, rather than assembling a packet by hand.</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--warm">
        <div className="ui-mkt__section">
          <div className="ui-mkt__section-head">
            <p className="ui-eyebrow">Clinic and portal</p>
            <h2>What each side does.</h2>
          </div>
          <div className="ui-mkt__split">
            <article className="ui-mkt__experience ui-mkt__experience--dietitian">
              <h3>Dietitian</h3>
              <ul>
                <li>Maintain the client chart, meal plan, and messages in one place</li>
                <li>Publish plans and review tracking from the portal</li>
                <li>Assign forms, share documents, and print PDF from the chart</li>
                <li>Schedule appointments and issue invoices</li>
                <li>Use analytics, with automations and AI on Pro</li>
              </ul>
              <Link href="/auth/dietitian/register" className="ui-link">
                Start free trial →
              </Link>
            </article>
            <article className="ui-mkt__experience ui-mkt__experience--patient">
              <h3>Patient</h3>
              <ul>
                <li>Create an account and enter the clinic join code</li>
                <li>View the published meal plan</li>
                <li>Log food, water, exercise, sleep, and habits</li>
                <li>Complete forms and message the dietitian</li>
                <li>Request visits, and view documents and invoices</li>
              </ul>
              <Link href="/auth/client/login" className="ui-link">
                Patient sign in →
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--cta">
        <div className="ui-mkt__cta-band">
          <h2>Start a 14-day trial.</h2>
          <p>
            No card required. Sample charts are included so you can explore the workspace. Remove them when you add
            your own clients.
          </p>
          <div className="ui-mkt__hero-ctas" style={{ justifyContent: "center" }}>
            <Link href="/auth/dietitian/register" className="ui-btn ui-btn--primary ui-btn--lg">
              Start free trial
            </Link>
            <Link href="/plans" className="ui-btn ui-btn--secondary ui-btn--lg">
              View plans
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
