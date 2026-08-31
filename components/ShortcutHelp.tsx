"use client";

import { useEffect, useRef } from "react";

type Props = {
  opener?: HTMLElement | null;
  onClose: () => void;
};

const shortcuts = [
  ["⌘ K / Ctrl K", "Open the jump menu"],
  ["Home / End", "Jump to the first or last result in the jump menu"],
  ["/", "Focus path search while tracing"],
  ["[ / ]", "Move to the previous or next path step"],
  ["← / →", "Change graph-path direction"],
  ["Esc", "Close an open panel or overlay"],
];

export function ShortcutHelp({ opener, onClose }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(opener ?? null);

  useEffect(() => {
    const first = dialogRef.current?.querySelector<HTMLElement>("button");
    first?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], [tabindex]:not([tabindex=\"-1\"])",
        ) ?? []),
      ];
      if (!focusable.length) return;
      const firstFocusable = focusable[0];
      const lastFocusable = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      openerRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="help-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialogRef}
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
      >
        <header>
          <div>
            <span className="panel-label">QUICK REFERENCE</span>
            <h2 id="shortcut-help-title">Read the graph faster.</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close shortcut help">
            ×
          </button>
        </header>
        <p>Every lens keeps the same path-reading controls, so you can stay on the evidence instead of hunting for buttons.</p>
        <dl>
          {shortcuts.map(([key, description]) => (
            <div key={key}>
              <dt><kbd>{key}</kbd></dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="help-done" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}
