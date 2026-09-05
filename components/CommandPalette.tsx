"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { countLabel, entryDisplayName, flowDisplayName, isSecurityProjection, nodeDisplayName, nodeKindLabel, type App } from "../lib/lachesis";
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
  onFile: (file: string) => void;
  opener?: HTMLElement | null;
};
type Command = {
  id: string;
  label: string;
  meta: string;
  keywords?: string;
  run: () => void;
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

function sourceCoverage(app: App, steps: Array<{ node_id: string }>) {
  const available = steps.filter((step) => {
    const node = app.nodes.find((item) => item.id === step.node_id);
    return Boolean(node?.snippet.trim() || node?.sourceWindow?.lines.length);
  }).length;
  return `${available}/${steps.length} source previews`;
}

function matchesCommand(command: Command, query: string) {
  const haystack = `${command.label} ${command.meta} ${command.keywords ?? ""}`.toLowerCase();
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean).every((term) => {
    const [key, ...rest] = term.split(":");
    if (!rest.length) return haystack.includes(term);
    const value = rest.join(":");
    if (key === "file") return command.id.startsWith("file-") && haystack.includes(value);
    if (key === "path") return command.id.startsWith("flow-") && haystack.includes(value);
    if (["kind", "module", "scope", "service", "repo", "repository"].includes(key)) return haystack.includes(value);
    return haystack.includes(value);
  });
}

function matchingNodeId(
  app: App,
  steps: Array<{
    node_id: string;
    role?: string;
    note?: string;
    edge?: {
      relation?: string;
      alias?: boolean;
      dynamic?: boolean;
      confidence?: string;
      limitations?: string[];
    };
  }>,
  query: string,
) {
  const scopedTerms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!scopedTerms.length) return steps[0]?.node_id ?? "";
  const match = steps.find((step) => {
    const node = app.nodes.find((item) => item.id === step.node_id);
    const haystack = [
      step.role,
      step.note,
      step.edge?.relation,
      node?.label,
      node?.qualifiedName,
      node?.signature,
      node?.documentation,
      node?.snippet,
      node?.sourceWindow?.lines.join(" "),
      node?.file,
      node?.module,
      node?.scope?.label,
      node?.scope?.service,
      node?.scope?.package,
      node?.scope?.module,
      node?.scope?.repository,
    ].filter(Boolean).join(" ").toLowerCase();
    return scopedTerms.every((term) => {
      const [key, ...rest] = term.split(":");
      const value = rest.join(":");
      if (rest.length) {
        if (key === "file") return node?.file.toLowerCase().includes(value);
        if (key === "kind") return node?.kind.toLowerCase().includes(value);
        if (key === "module") return [node?.module, node?.scope?.module].some((item) => item?.toLowerCase().includes(value));
        if (key === "scope" || key === "service" || key === "repo" || key === "repository") {
          return [node?.scope?.label, node?.scope?.repository, node?.scope?.service, node?.scope?.package, node?.scope?.module]
            .some((item) => item?.toLowerCase().includes(value));
        }
        if (key === "role") return step.role?.toLowerCase().includes(value) ?? false;
        if (key === "confidence") return step.edge?.confidence?.toLowerCase().includes(value) ?? false;
        if (key === "edge") {
          if (value === "alias") return Boolean(step.edge?.alias);
          if (value === "dynamic") return Boolean(step.edge?.dynamic);
          if (value === "uncertain") return Boolean(step.edge?.confidence || step.edge?.limitations?.length);
        }
        if (key === "has" && (value === "source" || value === "source-preview")) return Boolean(node?.snippet.trim() || node?.sourceWindow?.lines.length);
        if (key === "has" && (value === "source-gap" || value === "missing-source")) return !node?.snippet.trim() && !node?.sourceWindow?.lines.length;
        if (key === "has" && value === "mcp") return true;
        if (key === "path") return true;
        return false;
      }
      return haystack.includes(term);
    });
  });
  return match?.node_id ?? steps[0]?.node_id ?? "";
}

export function CommandPalette({
  app,
  onClose,
  onView,
  onFlow,
  onEntry,
  onSink,
  onNode,
  onFile,
  opener,
}: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const normalized = query.trim().toLowerCase();
  const dialogRef = useRef<HTMLElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(opener ?? null);
  const filePaths = useMemo(
    () => [...new Set([
      ...app.files.map((file) => file.path).filter(Boolean),
      ...app.nodes.map((node) => node.file).filter(Boolean),
    ])],
    [app.files, app.nodes],
  );
  useEffect(() => {
    commandInputRef.current?.focus();
  }, []);
  useEffect(() => {
    return () => openerRef.current?.focus();
  }, []);
  const commands = useMemo<Command[]>(
    () =>
      [
        {
          id: "view-home",
          label: "Open Understand home",
          meta: "View",
          run: () => onView("home"),
        },
        {
          id: "view-trace",
          label: "Trace a code path",
          meta: "View",
          run: () => onView("trace"),
        },
        {
          id: "view-journey",
          label: "Walk a request flow",
          meta: "View",
          run: () => onView("journey"),
        },
        {
          id: "view-investigate",
          label: "See what reaches a destination",
          meta: "View",
          run: () => onView("investigate"),
        },
        {
          id: "view-map",
          label: "Explore the codebase graph",
          meta: "View",
          run: () => onView("map"),
        },
        {
          id: "view-compare",
          label: "Compare code revisions",
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
          label: flowDisplayName(flow, app.nodes, app.flows),
          meta: `${flowKindLabel(flow, app.findings.some((finding) => finding.id === flow.id))} · ${countLabel(flow.steps.length, app.findings.some((finding) => finding.id === flow.id) ? "node" : "symbol")} · ${sourceCoverage(app, flow.steps)} · ${flowLocation(app, flow)}${flowScopes(app, flow).length > 1 ? ` · ${flowScopes(app, flow).join(" → ")}` : ""}`,
          keywords: flow.steps.flatMap((step) => {
            const node = app.nodes.find((item) => item.id === step.node_id);
            return node ? [node.label, node.qualifiedName, node.signature, node.documentation, node.snippet, node.sourceWindow?.lines.join(" "), node.file, node.module, node.scope?.label, node.scope?.service, node.scope?.package, node.scope?.module, node.scope?.repository] : [];
          }).concat([flow.description, ...flow.steps.flatMap((step) => [step.role, step.note, step.edge?.relation])]).filter(Boolean).join(" "),
          run: () => onFlow(flow.id, matchingNodeId(app, flow.steps, normalized)),
        })),
        ...app.entries.map((entry, index) => ({
          id: `entry-${entry.id}`,
          label: entryDisplayName(entry, app.nodes, app.entries),
          meta: `Request flow · ${countLabel(entry.hops.length, "step")} · ${sourceCoverage(app, entry.hops)}`,
          keywords: entry.hops.flatMap((hop) => {
            const node = app.nodes.find((item) => item.id === hop.node_id);
            return [hop.edge_label, hop.caption, node?.label, node?.qualifiedName, node?.signature, node?.documentation, node?.snippet, node?.sourceWindow?.lines.join(" "), node?.file, node?.module];
          }).filter(Boolean).join(" "),
          run: () => onEntry(index, matchingNodeId(app, entry.hops, normalized)),
        })),
        ...app.nodes.map((node) => ({
          id: `node-${node.id}`,
          label: nodeDisplayName(node),
          meta: `Symbol · ${nodeKindLabel(node.kind)} · ${nodeContext(node)} · ${node.file || "Source unavailable"}:${node.line || "—"} · ${node.qualifiedName ?? node.module ?? "graph node"}`,
          keywords: [node.qualifiedName, node.signature, node.documentation, node.snippet, node.sourceWindow?.lines.join(" "), node.file, node.module, node.scope?.module].filter(Boolean).join(" "),
          run: () => onNode(node.id),
        })),
        ...filePaths.map((path) => {
          const file = app.files.find((item) => item.path === path);
          return {
            id: `file-${path}`,
            label: `Open ${path}`,
            meta: `File · ${file?.lines ?? "?"} lines${file?.module ? ` · ${file.module}` : ""}`,
            keywords: path,
            run: () => onFile(path),
          };
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
            label: nodeDisplayName(node),
          meta: `${isSecurityProjection(app) ? "Sink" : "Destination"} · ${nodeContext(node)} · ${node.file || "Source unavailable"}:${node.line || "—"}`,
            run: () => onSink(node.id),
          })),
      ].filter(
        (command) =>
          !normalized ||
          matchesCommand(command, normalized),
      ),
    [app, filePaths, normalized, onView, onFlow, onEntry, onSink, onNode, onFile],
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
            ref={commandInputRef}
            id="command-search-input"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a path, symbol, file, filter, code, or view…"
            aria-label="Search views, paths, symbols, files, filters, documentation, and source code"
            aria-controls="command-results"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={
              visibleCommands[active] ? `command-option-${active}` : undefined
            }
          />
          <kbd>esc</kbd>
          <button type="button" className="command-close" onClick={onClose} aria-label="Close jump menu"><Icon name="close" size={16} /></button>
        </div>
        {query.trim() && (
          <p className="command-results-status" role="status">
            {countLabel(commands.length, "result")}
            {commands.length > visibleCommands.length ? " · refine to see more" : ""}
          </p>
        )}
        <div className="command-results" id="command-results" role="listbox" aria-label="Jump results">
          {visibleCommands.length ? (
            visibleCommands.map((command, index) => (
              <button
                type="button"
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
            <p>
              No results for “{query}”. Try a symbol, file path, graph path,
              or view name.
            </p>
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
