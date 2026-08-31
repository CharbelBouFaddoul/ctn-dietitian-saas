import type { Metadata } from "next";
import { LegalDocument } from "../../../components/legal-document";
import { LEGAL_OPERATOR, LEGAL_PRODUCT } from "../../../lib/marketing/legal";

export const metadata: Metadata = {
  title: "Terms of use",
  description: `Terms for using the ${LEGAL_PRODUCT} platform operated by ${LEGAL_OPERATOR}.`,
};

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Terms"
      title="Terms of use"
      summary={`These terms govern use of the ${LEGAL_PRODUCT} platform operated by ${LEGAL_OPERATOR}. They are a software agreement — not a treatment contract.`}
    >
      <h2>1. The service</h2>
      <p>
        {LEGAL_PRODUCT} is clinic software: dietitians get a workspace; patients get a portal after they register and
        join a clinic with a join code. Features depend on the clinic’s plan (for example AI or automations may be
        add-ons). Online card checkout is not built in; plans and billing are arranged with us.
      </p>
      <p>
        By creating an account, signing in, or using the site, you agree to these terms and to the{" "}
        <a href="/privacy">Privacy policy</a>.
      </p>

      <h2>2. Not medical advice or emergency care</h2>
      <p>
        <strong>
          The platform does not provide medical, dietetic, or emergency care. Nothing in the software is a diagnosis,
          prescription, or substitute for a qualified professional.
        </strong>
      </p>
      <ul>
        <li>Clinical responsibility sits with the dietitian and their clinic, not with {LEGAL_OPERATOR}.</li>
        <li>Patients follow plans and advice from their own dietitian, not from us.</li>
        <li>
          Do not use the product for emergencies. If you think you or someone else is in danger, call local emergency
          services.
        </li>
      </ul>

      <h2>3. Accounts</h2>
      <ul>
        <li>You must provide accurate information and keep your password confidential.</li>
        <li>You are responsible for activity on your account.</li>
        <li>Email verification is required for new accounts before normal use.</li>
        <li>We may suspend an account that is abusive, unsafe, unpaid, or that threatens the service or others.</li>
      </ul>

      <h2>4. Dietitians and clinics</h2>
      <p>If you use a clinic workspace, you confirm that you are allowed to practise and to hold client records. You must:</p>
      <ul>
        <li>obtain any consent your profession and local law require before storing a patient’s information;</li>
        <li>use join codes and the roster only for people you are actually caring for or onboarding;</li>
        <li>not upload files or notes you have no right to store;</li>
        <li>not rely on optional AI output as a clinical decision — review it yourself;</li>
        <li>keep your own professional insurance, licences, and records as required outside this software.</li>
      </ul>
      <p>
        Invoices and quotations in the product are clinic documents. Payment collection (bank transfer, cash, and so on)
        happens outside the app unless we later add payments and say so in writing.
      </p>

      <h2>5. Patients</h2>
      <ul>
        <li>You create your own login, then connect with the join code your dietitian gives you.</li>
        <li>Your dietitian can see information you log and documents in that clinic relationship.</li>
        <li>If you join more than one clinic, each clinic only sees the data for that connection.</li>
        <li>Questions about your care go to your dietitian, not to {LEGAL_OPERATOR} support.</li>
      </ul>

      <h2>6. Acceptable use</h2>
      <p>You may not:</p>
      <ul>
        <li>break the law, harass others, or try to access another clinic’s or person’s data;</li>
        <li>probe, overload, or reverse engineer the service except as allowed by law;</li>
        <li>upload malware or content you do not have rights to;</li>
        <li>use the service to send spam;</li>
        <li>present {LEGAL_OPERATOR} as providing healthcare.</li>
      </ul>

      <h2>7. Plans, fees, and cancellation</h2>
      <p>
        Clinic subscriptions are agreed with us (often via the contact form). Features, limits, and prices are those we
        confirm for that plan. Unpaid or expired subscriptions may move the clinic to restricted or locked access as
        described in the product.
      </p>
      <p>
        Either party may end the subscription according to the commercial terms we confirmed in writing (email is
        enough). We may stop providing the service with reasonable notice, or immediately if these terms are broken or
        if we must do so for security or law.
      </p>
      <p>
        After access ends, we may delete or anonymise data after a retention period. Export what you need before you
        leave. We are not a long-term archive once a workspace is closed.
      </p>

      <h2>8. Data and documents</h2>
      <p>
        You keep whatever intellectual-property rights you already have in content you upload (notes, PDFs, recipes).
        You grant us a licence to host, back up, and display that content as needed to operate the product for you and
        the people you connect.
      </p>
      <p>
        Food database entries and platform catalog data remain ours or our licensors’. Do not scrape or republish them
        as a competing dataset.
      </p>

      <h2>9. Availability and AI</h2>
      <p>
        We aim for a reliable service but do not guarantee uninterrupted uptime, error-free software, or that AI
        suggestions are accurate. Scheduled maintenance and faults will happen. Keep copies of anything you cannot
        afford to lose.
      </p>

      <h2>10. Liability</h2>
      <p>
        To the maximum extent allowed by law, {LEGAL_OPERATOR} is not liable for clinical outcomes, diet results, missed
        appointments, or decisions a clinic or patient makes using the software. We are not liable for indirect or
        consequential loss (lost profit, lost data, business interruption) arising from use of the service.
      </p>
      <p>
        If we are nevertheless found liable, our total liability for a claim is limited to the fees the relevant clinic
        paid us for the service in the three months before the claim, or USD 100 if no fees were paid.
      </p>
      <p>Nothing in these terms excludes liability that the law does not allow us to exclude (for example fraud).</p>

      <h2>11. Changes</h2>
      <p>
        We may update these terms. The version and date at the top will change. If you continue to use the product after
        an update, the new terms apply. If you do not agree, stop using the service and contact us to close the account.
      </p>

      <h2>12. Law</h2>
      <p>
        These terms are governed by the laws of Lebanon, without regard to conflict-of-law rules. Courts of Lebanon have
        jurisdiction, unless a mandatory consumer or data-protection rule in your country says otherwise.
      </p>
      <p>
        If a part of these terms cannot be enforced, the rest still applies. These terms are the software agreement
        between you and us for {LEGAL_PRODUCT}. They do not replace a clinic’s own patient agreement.
      </p>
    </LegalDocument>
  );
}
