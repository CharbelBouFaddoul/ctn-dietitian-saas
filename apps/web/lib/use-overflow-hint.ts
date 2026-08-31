"use client";

import { useEffect, useRef, useState } from "react";

/** Scroll fade hints for clinical pane / rail (same behavior as Personal data). */
export function useOverflowHint() {
  const ref = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(false);
  const [below, setBelow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      setAbove(el.scrollTop > 8);
      setBelow(max - el.scrollTop > 8);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    const watchChildren = () => {
      for (const child of el.children) resize.observe(child);
    };
    watchChildren();
    const mutate = new MutationObserver(() => {
      watchChildren();
      update();
    });
    mutate.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
      mutate.disconnect();
    };
  }, []);

  return { ref, above, below };
}
