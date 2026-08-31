"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { App } from "../lib/lachesis";
import { Icon } from "./Icon";
import { trackEvent } from "../lib/analytics";

type View = "home" | "trace" | "journey" | "investigate" | "map" | "compare" | "install";
type Props = {
  app: App;
  onClose: () => void;
  onView: (view: View) => void;
  onFlow: (flowId: string, nodeId: string) => void;
  onEntry: (index: number, hopId: string) => void;
  onSink: (sinkId: string) => void;
  onNode: (nodeId: string) => void;
  opener?: HTMLElement | null;
};

function flowLocation(app: App, flow: App["flows"][number]) {
  const nodes = flow.steps
    .map((step) => app.nodes.find((node) => node.id === step.node_id))
    .filter(Boolean);
  if (!nodes.length) return "source unavailable";
  const location = (node: (typeof app.nodes)[number]) =>
    `${node.file || "source unavailable"}:${node.line || "—"}`;
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  return first.id === last.id
    ? location(first)
    : `${location(first)} → ${location(last)}`;
}

function flowScopes(app: App, flow: App["flows"][number]) {
  const scopes: string[] = [];
  flow.steps.forEach((step) => {
    const node = app.nodes.find((item) => item.id === step.node_id);
    const scope = node?.scope?.label || node?.scope?.service || node?.scope?.package || node?.scope?.module || node?.scope?.repository;
    if (scope && scopes.at(-1) !== scope) scopes.push(scope);
  });
  return scopes;
}

function flowKindLabel(flow: App["flows"][number], security: boolean) {
  if (security) return "Security witness";
  const kind = flow.kind?.trim().toLowerCase();
  if (kind === "call-path" || kind === "callpath") return "Call path";
  if (kind === "data-flow" || kind === "dataflow") return "Data flow";
  if (kind === "value-flow" || kind === "valueflow") return "Value path";
  return flow.kind?.trim() || "Graph path";
}

function nodeContext(node: App["nodes"][number]) {
  return node.scope?.label || node.scope?.service || node.scope?.package || node.scope?.module || node.scope?.repository || node.module || "graph node";
}

export function CommandPalette({
  app,
  onClose,
  onView,
  onFlow,
  onEntry,
  onSink,
  onNode,
  opener,
}: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const normalized = query.trim().toLowerCase();
  const dialogRef = useRef<HTMLElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(opener ?? null);
  useEffect(() => {
    return () => openerRef.current?.focus();
  }, []);
  const commands = useMemo(
    () =>
      [
        {
          id: "view-home",
          label: "Open briefing",
          meta: "View",
          run: () => onView("home"),
        },
        {
          id: "view-trace",
          label: "Open graph-path lens",
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
          label: "Open convergence view",
          meta: "View",
          run: () => onView("investigate"),
        },
        {
          id: "view-map",
          label: "Open graph view",
          meta: "View",
          run: () => onView("map"),
        },
        {
          id: "view-compare",
          label: "Open revision diff",
          meta: "View",
          run: () => onView("compare"),
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
          meta: `${flowKindLabel(flow, app.findings.some((finding) => finding.id === flow.id))} · ${flow.steps.length} ${app.findings.some((finding) => finding.id === flow.id) ? "nodes" : "symbols"} · ${flowLocation(app, flow)}${flowScopes(app, flow).length > 1 ? ` · ${flowScopes(app, flow).join(" → ")}` : ""}`,
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
          meta: `Symbol · ${node.kind} · ${nodeContext(node)} · ${node.file || "Source unavailable"}:${node.line || "—"} · ${node.qualifiedName ?? node.module ?? "graph node"}`,
          run: () => onNode(node.id),
        })),
        ...app.files.flatMap((file) => {
          const node = app.nodes.find((item) => item.file === file.path);
          return node
            ? [
                {
                  id: `file-${file.id}`,
                  label: file.path,
                  meta: `File · ${file.lines ?? "?"} lines`,
                  run: () => onNode(node.id),
                },
              ]
            : [];
        }),
        ...app.modules.flatMap((module) => {
          const node = app.nodes.find(
            (item) =>
              module.nodeIds?.includes(item.id) ||
              item.module === module.id ||
              item.module === module.name,
          );
          return node
            ? [
                {
                  id: `module-${module.id}`,
                  label: module.name,
                  meta: `Module · ${module.path ?? "graph group"}`,
                  run: () => onNode(node.id),
                },
              ]
            : [];
        }),
        ...app.nodes
          .filter(
            (node) =>
              node.kind === "sink" ||
              app.flows.some((flow) =>
                flow.steps.some(
                  (step) => step.node_id === node.id && step.role.trim().toLowerCase() === "sink",
                ),
              ),
          )
          .map((node) => ({
            id: `sink-${node.id}`,
            label: node.label || node.id,
          meta: `Sink · ${nodeContext(node)} · ${node.file || "Source unavailable"}:${node.line || "—"}`,
            run: () => onSink(node.id),
          })),
      ].filter(
        (command) =>
          !normalized ||
          `${command.label} ${command.meta}`.toLowerCase().includes(normalized),
      ),
    [app, normalized, onView, onFlow, onEntry, onSink, onNode],
  );
  const visibleCommands = commands.slice(0, 80);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
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
                "input:not(:disabled),button:not(:disabled):not([tabindex=\"-1\"])",
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
            setActive((current) =>
              Math.min(Math.max(0, visibleCommands.length - 1), current + 1),
            );
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => Math.max(0, current - 1));
          }
          if (event.key === "Home") {
            event.preventDefault();
            setActive(0);
          }
          if (event.key === "End") {
            event.preventDefault();
            setActive(Math.max(0, visibleCommands.length - 1));
          }
          if (event.key === "Enter" && visibleCommands[active]) {
            event.preventDefault();
            execute(visibleCommands[active]);
          }
        }}
      >
        <div className="command-search">
          <Icon name="search" size={17} />
          <input
            id="command-search-input"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to a view, path, symbol, file, or boundary…"
            aria-label="Search views, paths, symbols, files, and boundaries"
            aria-controls="command-results"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={
              visibleCommands[active] ? `command-option-${active}` : undefined
            }
          />
          <kbd>esc</kbd>
          <button type="button" className="command-close" onClick={onClose} aria-label="Close jump menu">×</button>
        </div>
        <div className="command-results" id="command-results" role="listbox" aria-label="Jump results">
          {visibleCommands.length ? (
            visibleCommands.map((command, index) => (
              <button
                key={command.id}
                id={`command-option-${index}`}
                ref={active === index ? activeOptionRef : undefined}
                role="option"
                tabIndex={-1}
                className={active === index ? "active" : ""}
                aria-selected={active === index}
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
          {commands.length > visibleCommands.length && (
            <p className="command-more">
              Showing first 80 matches. Refine your search to find more.
            </p>
          )}
        </div>
        <div className="command-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> browse
          </span>
          <span><kbd>home</kbd><kbd>end</kbd> jump</span>
          <span>
            <kbd>enter</kbd> open
          </span>
          <span>Local bundle only</span>
        </div>
      </section>
    </div>
  );
}
