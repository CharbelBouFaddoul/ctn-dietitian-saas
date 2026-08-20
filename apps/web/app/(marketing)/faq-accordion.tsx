"use client";

import { useId, useState } from "react";

export function FaqAccordionItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={`ui-mkt__faq-item${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="ui-mkt__faq-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{question}</span>
        <span className="ui-mkt__faq-icon" aria-hidden="true" />
      </button>
      <div className="ui-mkt__faq-panel" id={panelId} role="region" aria-hidden={!open}>
        <div className="ui-mkt__faq-panel-inner">
          <p>{answer}</p>
        </div>
      </div>
    </div>
  );
}
