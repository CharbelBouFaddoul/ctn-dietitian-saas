"use client";

import { FormEvent, useState } from "react";
import { Alert, Button, Field, Input, Textarea } from "@nutrition-saas/ui";

export default function ContactPage() {
  const [sent, setSent] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <section className="ui-mkt__section">
      <h1>Contact</h1>
      <p className="ui-muted">Tell us about your practice. We’ll follow up by email.</p>
      {sent ? (
        <Alert tone="success">Thanks — we’ll be in touch.</Alert>
      ) : (
        <form onSubmit={onSubmit} style={{ maxWidth: 480, marginTop: 24 }}>
          <Field label="Name">
            <Input name="name" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Message">
            <Textarea name="message" required />
          </Field>
          <Button type="submit">Send</Button>
        </form>
      )}
    </section>
  );
}
