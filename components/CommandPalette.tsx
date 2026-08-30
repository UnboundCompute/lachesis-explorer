"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { App } from "../lib/lachesis";
import { Icon } from "./Icon";
import { trackEvent } from "../lib/analytics";

type View = "trace" | "journey" | "investigate" | "map" | "install";
type Props = {
  app: App;
  onClose: () => void;
  onView: (view: View) => void;
  onFlow: (flowId: string, nodeId: string) => void;
  onEntry: (index: number, hopId: string) => void;
  onSink: (sinkId: string) => void;
  onNode: (nodeId: string) => void;
};
export function CommandPalette({
  app,
  onClose,
  onView,
  onFlow,
  onEntry,
  onSink,
  onNode,
}: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const normalized = query.trim().toLowerCase();
  const dialogRef = useRef<HTMLElement>(null);
  const commands = useMemo(
    () =>
      [
        {
          id: "view-trace",
          label: "Open value-flow lens",
          meta: "View",
          run: () => onView("trace"),
        },
        {
          id: "view-journey",
          label: "Open request-path lens",
          meta: "View",
          run: () => onView("journey"),
        },
        {
          id: "view-investigate",
          label: "Open sink-first investigation",
          meta: "View",
          run: () => onView("investigate"),
        },
        {
          id: "view-map",
          label: "Open system topology map",
          meta: "View",
          run: () => onView("map"),
        },
        {
          id: "view-install",
          label: "Open local workflow",
          meta: "View",
          run: () => onView("install"),
        },
        ...app.flows.map((flow) => ({
          id: `flow-${flow.id}`,
          label: flow.name,
          meta: `Value flow · ${flow.steps.length} nodes`,
          run: () => onFlow(flow.id, flow.steps[0]?.node_id ?? ""),
        })),
        ...app.entries.map((entry, index) => ({
          id: `entry-${entry.id}`,
          label: entry.label,
          meta: `Request path · ${entry.hops.length} hops`,
          run: () => onEntry(index, entry.hops[0]?.node_id ?? ""),
        })),
        ...app.nodes.map((node) => ({
          id: `node-${node.id}`,
          label: node.label || node.id,
          meta: `Symbol · ${node.kind} · ${node.file}:${node.line}`,
          run: () => onNode(node.id),
        })),
        ...app.files.map((file) => ({
          id: `file-${file.id}`,
          label: file.path,
          meta: `File · ${file.lines ?? "?"} lines`,
          run: () =>
            onNode(app.nodes.find((node) => node.file === file.path)?.id ?? ""),
        })),
        ...app.modules.map((module) => ({
          id: `module-${module.id}`,
          label: module.name,
          meta: `Module · ${module.path ?? "graph group"}`,
          run: () =>
            onNode(
              app.nodes.find(
                (node) =>
                  module.nodeIds?.includes(node.id) ||
                  node.module === module.id ||
                  node.module === module.name,
              )?.id ?? "",
            ),
        })),
        ...app.nodes
          .filter(
            (node) =>
              node.kind === "sink" ||
              app.findings.some((flow) =>
                flow.steps.some(
                  (step) => step.node_id === node.id && step.role === "sink",
                ),
              ),
          )
          .map((node) => ({
            id: `sink-${node.id}`,
            label: node.label || node.id,
            meta: `Sink · ${node.file}:${node.line}`,
            run: () => onSink(node.id),
          })),
      ].filter(
        (command) =>
          !normalized ||
            `${command.label} ${command.meta}`
              .toLowerCase()
              .includes(normalized),
      ),
    [app, normalized, onView, onFlow, onEntry, onSink, onNode],
  );
  useEffect(() => setActive(0), [query]);
  function execute(command: (typeof commands)[number]) {
    command.run();
    trackEvent("command_executed", { type: command.meta.split(" · ")[0] });
    onClose();
  }
  return (
    <div
      className="command-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Navigate Lachesis Explorer"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Tab") {
            const focusable = [
              ...(dialogRef.current?.querySelectorAll<HTMLElement>(
                "input,button",
              ) ?? []),
            ];
            if (focusable.length) {
              const first = focusable[0],
                last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => Math.min(commands.length - 1, current + 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => Math.max(0, current - 1));
          }
          if (event.key === "Enter" && commands[active]) {
            event.preventDefault();
            execute(commands[active]);
          }
        }}
      >
        <label className="command-search">
          <Icon name="search" size={17} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to a view, value, request, or sink…"
            aria-label="Search commands"
          />
          <kbd>esc</kbd>
        </label>
        <div className="command-results">
          {commands.length ? (
            commands.map((command, index) => (
              <button
                key={command.id}
                className={active === index ? "active" : ""}
                onMouseEnter={() => setActive(index)}
                onClick={() => execute(command)}
              >
                <span className="command-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <b>{command.label}</b>
                  <small>{command.meta}</small>
                </span>
                <Icon name="arrow" size={13} />
              </button>
            ))
          ) : (
            <p>No matching command.</p>
          )}
        </div>
        <div className="command-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> browse
          </span>
          <span>
            <kbd>enter</kbd> open
          </span>
          <span>Local bundle only</span>
        </div>
      </section>
    </div>
  );
}
