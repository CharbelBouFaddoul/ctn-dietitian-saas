import { FaqAccordionItem } from "../faq-accordion";

const FAQ_CATEGORIES = [
  {
    name: "Getting started",
    items: [
      {
        q: "How do I open a clinic?",
        a: "Create a dietitian account from Start free trial. Your workspace opens the same day, with a 14-day trial and a few sample clients so you can look around. No card is required.",
      },
      {
        q: "What are the sample clients?",
        a: "They are example charts included with the trial so you can click through a real workflow. Remove them from Practice in clinic settings when you are ready to add your own clients.",
      },
      {
        q: "How does a patient connect to my clinic?",
        a: "Share your clinic join code. The patient creates their own account, signs in, and enters the code once. They then appear on your Clients list. You can also create a chart yourself without waiting for them to join.",
      },
      {
        q: "Where is the join code?",
        a: "On the Clients page in the clinic workspace. Generate the code, copy it, and send it to the person you work with. You can also issue a code from a client chart.",
      },
      {
        q: "How do I start as a patient?",
        a: "Create a patient account, sign in, then enter the join code your dietitian gave you. If you already have an account, use Patient sign in.",
      },
      {
        q: "What happens when the trial ends?",
        a: "You choose Standard or Pro to keep the clinic running. Compare what is included on the Plans page, then continue on the plan that fits your practice.",
      },
    ],
  },
  {
    name: "Clinic workspace",
    items: [
      {
        q: "Where do I work day to day?",
        a: "After you sign in as a dietitian, you land in the clinic dashboard. From there you open Clients, Meal Plans, Messages, Calendar, Invoices, and the rest of the workspace.",
      },
      {
        q: "How do I add a client?",
        a: "Open Clients and create a chart, or share the clinic join code so they connect themselves. Each client has one record for notes, measurements, plans, messages, visits, and invoices.",
      },
      {
        q: "How do I share a meal plan?",
        a: "Build the plan on the client chart from foods, recipes, and habits, then publish it. The current version appears in the patient portal under My Plan.",
      },
      {
        q: "How do I see what a patient logged?",
        a: "Open the client chart and go to tracking. Food, water, exercise, sleep, and habits from the portal show there, so you can review progress before a visit.",
      },
      {
        q: "How do messaging and appointments work?",
        a: "Messages stay on the client record. Appointments are on the clinic calendar. Patients can message you and request visits from the portal.",
      },
      {
        q: "What is the difference between Standard and Pro?",
        a: "Both include the clinic workspace and patient portal. Pro adds automations and AI assistance. Compare them on the Plans page. Start with the trial, then continue on the plan you need.",
      },
      {
        q: "Does AI write care on its own?",
        a: "No. On Pro, AI can help draft notes, plans, and messages. You review and decide what to keep. Care still comes from the dietitian.",
      },
    ],
  },
  {
    name: "Patient portal",
    items: [
      {
        q: "What will I see after I join?",
        a: "Your home view, the published meal plan, a daily log, messages, appointments, forms, documents, and invoices from your dietitian.",
      },
      {
        q: "What can I log each day?",
        a: "Food, water, exercise, sleep, habits, and weight from the daily log. Your dietitian can review this on your chart.",
      },
      {
        q: "I lost the join code. What should I do?",
        a: "Ask your dietitian for a new code from their Clients page. Older codes can expire or be replaced.",
      },
      {
        q: "Can I connect to more than one clinic?",
        a: "Yes. After you have a patient account, you can enter another join code to connect to an additional dietitian.",
      },
    ],
  },
  {
    name: "Account",
    items: [
      {
        q: "Can I reset my password?",
        a: "Yes. Use Forgot password on the dietitian or patient sign-in screen. We send a reset email to the address on the account.",
      },
      {
        q: "Does the platform give medical advice?",
        a: "No. This is clinic software. Care and meal plans come from the dietitian. Do not use it for emergencies. Call local emergency services.",
      },
      {
        q: "Where are the privacy policy and terms?",
        a: "Privacy policy and Terms of use are in the website footer. You agree to both when you create an account.",
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
          <h1>Common questions.</h1>
          <p>How to open the workspace, connect patients, and use the clinic day to day.</p>
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
