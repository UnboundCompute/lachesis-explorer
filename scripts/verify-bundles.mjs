import { readFile } from "node:fs/promises";

const fixtures = ["public/code-exploration-bundle.json", "public/demo-bundle.json"];

function fail(file, message) {
  throw new Error(`${file}: ${message}`);
}

function verify(file, bundle) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) fail(file, "bundle must be a JSON object");
  const graph = bundle.graph;
  if (!graph || !Array.isArray(graph.nodes)) fail(file, "graph.nodes must be an array");
  const ids = new Set(graph.nodes.map((node) => String(node.id ?? node.node_id ?? "")));
  if (ids.size !== graph.nodes.length || ids.has("")) fail(file, "graph nodes must have unique non-empty IDs");

  for (const [index, edge] of (graph.edges ?? []).entries()) {
    const source = String(edge.source ?? edge.from ?? edge.source_id ?? "");
    const target = String(edge.target ?? edge.to ?? edge.target_id ?? "");
    if (!ids.has(source) || !ids.has(target)) fail(file, `graph.edges[${index}] references a missing node`);
  }

  const paths = bundle.paths ?? {};
  for (const [kind, pathList] of Object.entries({ values: paths.values ?? graph.value_flows ?? graph.flows ?? [], requests: paths.requests ?? graph.request_paths ?? graph.callpaths ?? [] })) {
    if (!Array.isArray(pathList)) fail(file, `paths.${kind} must be an array`);
    for (const [pathIndex, path] of pathList.entries()) {
      const steps = path.steps ?? path.hops ?? [];
      if (!Array.isArray(steps)) fail(file, `paths.${kind}[${pathIndex}] steps must be an array`);
      if (kind === "values" && steps.length === 0) fail(file, `paths.values[${pathIndex}] must contain at least one step`);
      for (const [stepIndex, step] of steps.entries()) {
        const nodeId = String(step.node_id ?? step.nodeId ?? step.node ?? "");
        if (!ids.has(nodeId)) fail(file, `paths.${kind}[${pathIndex}] step ${stepIndex} references a missing node`);
      }
    }
  }

  for (const [index, record] of (bundle.mcp ?? []).entries()) {
    for (const nodeId of (Array.isArray(record.nodes) ? record.nodes : record.node_ids ?? [])) {
      if (!ids.has(String(nodeId))) fail(file, `mcp[${index}] references a missing node`);
    }
  }

  if (String(bundle.schema_version ?? "") === "2.0" && !bundle.security) fail(file, "2.0 bundles must declare the optional security overlay");
  console.log(`${file}: valid (${graph.nodes.length} nodes, ${(graph.edges ?? []).length} edges)`);
}

for (const file of process.argv.slice(2).length ? process.argv.slice(2) : fixtures) {
  const bundle = JSON.parse(await readFile(file, "utf8"));
  verify(file, bundle);
}
