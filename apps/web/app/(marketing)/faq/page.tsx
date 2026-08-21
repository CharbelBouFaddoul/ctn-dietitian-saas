import { FaqAccordionItem } from "../faq-accordion";

const FAQ_CATEGORIES = [
  {
    name: "General",
    items: [
      {
        q: "What is this platform?",
        a: "It is a nutrition clinic SaaS for dietitians and the patients they work with. Dietitians use a clinic workspace; patients use a client portal connected by a clinic join code.",
      },
      {
        q: "Who is it for?",
        a: "Dietitians and nutrition clinics who want client charts, meal plans, tracking, messaging, documents, invoices, and related clinic tools in one place — and patients who need a simple portal to follow care.",
      },
      {
        q: "Is there a separate admin product on the public website?",
        a: "No. The public website is for dietitians and patients only. Platform administration is not offered as a public sign-in option.",
      },
    ],
  },
  {
    name: "Dietitians",
    items: [
      {
        q: "Can a dietitian manage multiple clients?",
        a: "Yes. The clinic workspace includes a client roster with search, filters, tags, and full client charts.",
      },
      {
        q: "Can dietitians create meal plans and recipes?",
        a: "Yes. You can draft and publish meal plans per client, create recipes, and use the food database (including organization overrides).",
      },
      {
        q: "What clinic operations are included?",
        a: "Appointments and a clinic calendar, messaging, documents, invoices, tasks, analytics, and clinic settings. AI assistance and automations are available on plans that include those capabilities.",
      },
    ],
  },
  {
    name: "Patients",
    items: [
      {
        q: "How does a patient join a dietitian?",
        a: "Patients create their own account, verify email, sign in, then enter the clinic join code provided by their dietitian. That connects them to the correct clinic roster.",
      },
      {
        q: "What can patients track?",
        a: "Food, water, exercise, sleep, and habits from the client portal tracking area.",
      },
      {
        q: "Can patients see invoices?",
        a: "Yes — invoices are viewable in the portal. Online payment is not built into the product; clinics manage payment status from the clinic side.",
      },
    ],
  },
  {
    name: "Accounts & Security",
    items: [
      {
        q: "Do patients need an invitation link with a temporary password?",
        a: "No. Patients register with their own credentials, then use a short clinic join code to connect. That is the supported onboarding path.",
      },
      {
        q: "Is email verification required?",
        a: "Yes. New accounts go through email verification before normal use of the product.",
      },
      {
        q: "Can I reset my password?",
        a: "Yes. Use the forgot-password flow on the sign-in screens to request a reset email.",
      },
    ],
  },
  {
    name: "Meal Plans & Tracking",
    items: [
      {
        q: "How do meal plans reach patients?",
        a: "Dietitians draft meal plans in the clinic workspace and publish them. Patients see the published plan in My Plan on the portal.",
      },
      {
        q: "Can dietitians review what patients log?",
        a: "Yes. Food, water, exercise, sleep, and habit logs appear on the client chart tracking area for clinic review.",
      },
    ],
  },
  {
    name: "AI & Automation",
    items: [
      {
        q: "Does the platform support AI?",
        a: "Yes, as an optional plan capability. Clinic users can use AI assistance for things like client summaries, meal-plan help, nutrition assistance, consultation notes, and message drafts when the organization plan includes AI.",
      },
      {
        q: "What do automations do?",
        a: "On plans that include automations, practices can create rules for events such as upcoming appointments, client inactivity, overdue invoices, due tasks, meal-plan endings, and check-ins — with actions like notifications, email, tasks, or portal notices.",
      },
    ],
  },
  {
    name: "Getting Started",
    items: [
      {
        q: "How do I start as a dietitian?",
        a: "Use Get Started / Create clinic account, verify your email, sign in, and open your clinic workspace.",
      },
      {
        q: "How do I start as a patient?",
        a: "Create a patient account, verify your email, sign in, then enter the join code from your dietitian. If you already have an account, use Patient sign in.",
      },
      {
        q: "Where do I learn the full join-code flow?",
        a: "See the How it works page for the step-by-step relationship between clinic and patient.",
      },
    ],
  },
] as const;

export default function FaqPage() {
  return (
    <>
      <section className="ui-mkt__band ui-mkt__band--warm">
        <div className="ui-mkt__hero">
          <p className="ui-eyebrow">FAQ</p>
          <h1>Questions? We’ve got answers.</h1>
          <p>Straightforward answers based on how the product works today — no invented capabilities.</p>
        </div>
      </section>

      <section className="ui-mkt__band ui-mkt__band--warm">
        <div className="ui-mkt__section" style={{ paddingTop: 0 }}>
          <div className="ui-mkt__faq">
            {FAQ_CATEGORIES.map((category) => (
              <div key={category.name} className="ui-mkt__faq-cat">
                <h3>{category.name}</h3>
                <div className="ui-mkt__faq-list">
                  {category.items.map((item) => (
                    <FaqAccordionItem key={item.q} question={item.q} answer={item.a} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
