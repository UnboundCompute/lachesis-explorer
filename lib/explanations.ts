import type { App, Entry, Flow, Node, Step } from "./lachesis";

function location(node?: Node) {
  if (!node) return "Source location unavailable";
  return node.file ? `${node.file}:${node.line || "—"}` : "Source location unavailable";
}

function scope(node?: Node) {
  return node?.scope?.label || node?.scope?.service || node?.scope?.package || node?.scope?.module || node?.scope?.repository || "";
}

function codeBlock(snippet: string) {
  if (!snippet.trim()) return "Source snippet was not included in the bundle.";
  return snippet.split("\n").map((line) => `    ${line}`).join("\n");
}

function repositoryHeader(app: App) {
  return [
    `Repository: ${app.name || "Untitled bundle"}`,
    `Revision: ${app.commit || "Not reported"}`,
    `Language: ${app.language || "Not reported"}`,
  ].join("\n");
}

function explorerReference(url?: string) {
  if (!url) return "";
  return `\n\n## Open in Lachesis\n\n${url}\n\nThe graph bundle is processed locally and is not embedded in this link.`;
}

export function explainFlow(app: App, flow: Flow, direction: "backward" | "forward", selectedIndex: number, url?: string) {
  const steps = direction === "backward" ? flow.steps : [...flow.steps].reverse();
  const selectedStep = steps[selectedIndex] ?? steps[0];
  const selectedNode = app.nodes.find((node) => node.id === selectedStep?.node_id);
  const path = steps.map((step: Step, index) => {
    const node = app.nodes.find((item) => item.id === step.node_id);
    const context = scope(node);
    const relation = step.edge?.relation || step.role || "continues to";
    return `${index + 1}. **${node?.label || step.node_id}** — ${relation}\n   \`${location(node)}\`${context ? ` · ${context}` : ""}${step.note ? `\n   ${step.note}` : ""}`;
  }).join("\n");

  return `# ${flow.name}\n\n${flow.description || `A ${flow.kind || "graph"} path through ${steps.length} symbols.`}\n\n${repositoryHeader(app)}\nExplorer direction: ${direction === "backward" ? "comes from" : "goes to"}\n\n## Path\n\n${path}\n\n## Current focus\n\n**${selectedNode?.label || selectedStep?.node_id || "Unknown symbol"}** at \`${location(selectedNode)}\`\n\n${codeBlock(selectedNode?.snippet || "")}${explorerReference(url)}`;
}

export function explainEntry(app: App, entry: Entry, selectedIndex: number, url?: string) {
  const selectedHop = entry.hops[selectedIndex] ?? entry.hops[0];
  const selectedNode = app.nodes.find((node) => node.id === selectedHop?.node_id);
  const path = entry.hops.map((hop, index) => {
    const node = app.nodes.find((item) => item.id === hop.node_id);
    const context = scope(node);
    return `${index + 1}. **${node?.label || hop.node_id}** — ${hop.edge_label || "calls"}\n   \`${location(node)}\`${context ? ` · ${context}` : ""}${hop.caption ? `\n   ${hop.caption}` : ""}`;
  }).join("\n");

  return `# ${entry.label}\n\n${entry.description || `A request flow through ${entry.hops.length} symbols.`}\n\n${repositoryHeader(app)}\n\n## Request flow\n\n${path}\n\n## Current focus\n\n**${selectedNode?.label || selectedHop?.node_id || "Unknown symbol"}** at \`${location(selectedNode)}\`\n\n${codeBlock(selectedNode?.snippet || "")}${explorerReference(url)}`;
}
