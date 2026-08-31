import type { Metadata } from "next";
import { LegalDocument } from "../../../components/legal-document";
import { LEGAL_OPERATOR, LEGAL_PRODUCT } from "../../../lib/marketing/legal";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${LEGAL_OPERATOR} handles personal and health-related data on the ${LEGAL_PRODUCT} platform.`,
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Privacy"
      title="Privacy policy"
      summary={`${LEGAL_OPERATOR} operates the ${LEGAL_PRODUCT} platform for dietitians and their clients. This page explains what we collect, who can see it, and how to ask about your data.`}
    >
      <h2>1. Who we are</h2>
      <p>
        {LEGAL_OPERATOR} (“we”, “us”) provides {LEGAL_PRODUCT}, a clinic software service: a workspace for dietitians
        and a portal for the patients they connect to their clinic. We are the company that hosts and maintains the
        software. We are not your doctor, dietitian, or clinic.
      </p>
      <p>
        Questions about this policy: use the <a href="/contact">Contact</a> page. If a clinic has published a contact
        email in site settings, you may also write to that address.
      </p>

      <h2>2. Who is responsible for patient data</h2>
      <p>
        When a patient is connected to a clinic, that <strong>clinic is responsible</strong> for the professional
        relationship and for the chart it keeps (meal plans, notes, measurements, messages, documents, invoices, and
        similar records). We provide the system the clinic uses. We process that data to run the service they subscribed
        to — not to treat patients ourselves.
      </p>
      <p>
        Account data you create to sign in (email, name, password) is processed by us so you can use the product.
      </p>

      <h2>3. What we collect</h2>
      <p>Depending on your role, the platform may store:</p>
      <ul>
        <li>
          <strong>Account:</strong> name, email, password (stored as a hash, not in plain text), role, session cookies,
          email-verification and password-reset tokens.
        </li>
        <li>
          <strong>Clinic:</strong> practice name and settings, subscription/plan, join codes, roster, invoices,
          appointments, tasks, documents, and clinic configuration.
        </li>
        <li>
          <strong>Care and tracking:</strong> client profiles, measurements, food / water / exercise / sleep / habit
          logs, meal plans, recipes, assessments/forms, messages, notifications, and uploaded files.
        </li>
        <li>
          <strong>Technical:</strong> IP address or similar connection data when needed for security, rate limiting,
          audit logs, and abuse prevention.
        </li>
        <li>
          <strong>Contact form:</strong> whatever you send us on the public contact page.
        </li>
      </ul>
      <p>
        Tracking and chart fields can include health-related information (for example weight, intake, clinical notes).
        Treat that as sensitive. Do not use the product for anyone who has not agreed to share that information with
        their dietitian.
      </p>

      <h2>4. How we use it</h2>
      <ul>
        <li>To create and secure accounts, and to send verification, password-reset, and service emails.</li>
        <li>To let a clinic and its connected patients use the workspace and portal as designed.</li>
        <li>To operate subscriptions, invoices inside the product, and platform administration.</li>
        <li>To keep the service running (backups, security, fixing bugs, preventing abuse).</li>
        <li>
          Optional <strong>AI features</strong>, only when a clinic’s plan includes them and they are turned on: the
          text or context needed for that feature may be sent to our AI provider to generate a response. Do not put
          information into AI tools that you are not allowed to share.
        </li>
      </ul>
      <p>We do not sell personal data. We do not use patient charts for advertising.</p>

      <h2>5. Who can see it</h2>
      <ul>
        <li>
          <strong>Patients</strong> see their own portal: plans shared with them, their logs, messages with that clinic,
          invoices, and similar portal items.
        </li>
        <li>
          <strong>Dietitians</strong> see the charts and operations for clients connected to their clinic — not other
          clinics’ patients.
        </li>
        <li>
          <strong>Platform admins</strong> (our operators) can access the admin tools needed to run the product
          (accounts, plans, catalog, system health). They are not a substitute for the clinic’s own records policy.
        </li>
        <li>
          <strong>Processors we use</strong> to host the app, database, email, file storage, and (if enabled) AI. They
          only get what is needed to provide that function.
        </li>
      </ul>
      <p>
        A patient connected to more than one clinic will see data scoped to the clinic they have selected. Clinics do
        not see each other’s charts.
      </p>

      <h2>6. Cookies</h2>
      <p>
        We use a session cookie so you stay signed in. That cookie is required for the product to work. We do not run a
        third-party advertising cookie on the marketing site today. If we add analytics later, we will update this
        policy.
      </p>

      <h2>7. How long we keep data</h2>
      <p>
        We keep account and clinic data while the account or subscription is active, and for a reasonable period
        afterward so a clinic can export or we can close the workspace (including backups and legal or security needs).
        Clinics should not assume we are their only archive. If you want data deleted, contact the clinic first for
        chart data, or us via <a href="/contact">Contact</a> for your login account.
      </p>

      <h2>8. Security</h2>
      <p>
        We use access control by clinic, hashed passwords, signed-in sessions, and HTTPS in production. No online
        service is perfectly secure. Do not share your password. Clinics must use the product in line with their
        professional and confidentiality duties.
      </p>

      <h2>9. Children</h2>
      <p>
        The public registration flows are not directed at children. A dietitian may keep records for a minor as part of
        clinical care; that is the clinic’s responsibility, including any parent or guardian consent their profession
        requires.
      </p>

      <h2>10. Your requests</h2>
      <p>You can ask us (or your clinic, for chart data) to:</p>
      <ul>
        <li>correct inaccurate account details;</li>
        <li>explain what is stored about your login;</li>
        <li>close an account where the product allows it, or by contacting us;</li>
        <li>receive a copy of data the clinic or we can reasonably export.</li>
      </ul>
      <p>
        Legal rights depend on where you live. We will handle reasonable requests. We may need to verify it is you, and
        we may refuse requests that would break another person’s confidentiality or our security.
      </p>

      <h2>11. International hosting</h2>
      <p>
        Servers and backups may be in a different country from you. By using the service you understand that your data
        may be stored or accessed in those locations in order to run the platform.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update this policy. The version and date at the top will change. Continued use after an update means you
        accept the revised policy for the product. Material changes should also be reflected in the consent version we
        store at registration.
      </p>
    </LegalDocument>
  );
}
