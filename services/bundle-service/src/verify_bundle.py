"""Small publish-time validator for the graph-first Explorer bundle contract."""
from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlparse


_SOURCE_TEMPLATE_FIELDS = {"file", "line", "end_line", "revision"}


def _fail(message: str) -> None:
    raise ValueError(f"invalid Explorer bundle: {message}")


def _non_empty_string(value: Any, label: str) -> None:
    if not isinstance(value, str) or not value.strip():
        _fail(f"{label} must be a non-empty string")


def _source_backed(node: dict[str, Any]) -> bool:
    if not isinstance(node.get("file"), str) or not node["file"].strip():
        return False
    if not isinstance(node.get("line"), int) or node["line"] < 1:
        return False
    snippet = node.get("snippet")
    window = node.get("source_window")
    return bool(isinstance(snippet, str) and snippet.strip()) or bool(
        isinstance(window, dict) and isinstance(window.get("lines"), list) and window["lines"]
    )


def _validate_source_url_template(value: Any) -> None:
    _non_empty_string(value, "meta.source_url_template")
    template = value.strip()
    fields = set(re.findall(r"\{([^{}]+)\}", template))
    if fields - _SOURCE_TEMPLATE_FIELDS:
        _fail("meta.source_url_template contains an unsupported placeholder")
    if "file" not in fields:
        _fail("meta.source_url_template must include the {file} placeholder")
    rendered = template
    replacements = {
        "file": "src/main.py",
        "line": "12",
        "end_line": "18",
        "revision": "a" * 40,
    }
    for field, replacement in replacements.items():
        rendered = rendered.replace("{" + field + "}", replacement)
    parsed = urlparse(rendered)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        _fail("meta.source_url_template must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password:
        _fail("meta.source_url_template must not contain credentials")


def _validate_curated_tour(
    value: Any,
    value_paths: list[Any],
    request_paths: list[Any],
    node_ids: set[str],
) -> None:
    if value is None:
        return
    if not isinstance(value, dict):
        _fail("meta.curated_tour must be an object")
    _non_empty_string(value.get("id"), "meta.curated_tour.id")
    _non_empty_string(value.get("title"), "meta.curated_tour.title")
    steps = value.get("steps")
    if not isinstance(steps, list) or not steps:
        _fail("meta.curated_tour.steps must be a non-empty array")
    paths: dict[str, set[str]] = {}
    for path in [*value_paths, *request_paths]:
        if not isinstance(path, dict) or not isinstance(path.get("id"), str) or not path["id"]:
            continue
        raw_nodes = path.get("steps") if isinstance(path.get("steps"), list) else path.get("hops")
        paths[path["id"]] = {
            step.get("node_id")
            for step in raw_nodes or []
            if isinstance(step, dict) and isinstance(step.get("node_id"), str)
        }
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            _fail(f"meta.curated_tour.steps[{index}] must be an object")
        _non_empty_string(step.get("flow_id"), f"meta.curated_tour.steps[{index}].flow_id")
        flow_id = step["flow_id"]
        if flow_id not in paths:
            _fail(f"meta.curated_tour.steps[{index}] references an unknown path")
        node_id = step.get("node_id")
        if node_id is not None:
            _non_empty_string(node_id, f"meta.curated_tour.steps[{index}].node_id")
            if node_id not in node_ids or node_id not in paths[flow_id]:
                _fail(f"meta.curated_tour.steps[{index}] references an unknown path node")
    maintainer = value.get("maintainer")
    if maintainer is None:
        return
    if not isinstance(maintainer, dict):
        _fail("meta.curated_tour.maintainer must be an object")
    _non_empty_string(maintainer.get("name"), "meta.curated_tour.maintainer.name")
    if maintainer.get("verified") is not True:
        _fail("meta.curated_tour.maintainer.verified must be true")
    if "url" in maintainer:
        _non_empty_string(maintainer["url"], "meta.curated_tour.maintainer.url")
        parsed = urlparse(maintainer["url"].strip())
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
            _fail("meta.curated_tour.maintainer.url must be an absolute HTTP(S) URL without credentials")


def _understanding_path_has_source(path: Any, nodes: dict[str, dict[str, Any]], key: str) -> bool:
    if not isinstance(path, dict):
        return False
    raw_steps = path.get("steps") if key == "values" else path.get("hops")
    if not isinstance(raw_steps, list):
        return False
    node_ids = [step.get("node_id") for step in raw_steps if isinstance(step, dict)]
    if len(node_ids) < 3 or len(set(node_ids)) < 3:
        return False
    if any(node_id not in nodes or not _source_backed(nodes[node_id]) for node_id in node_ids):
        return False
    source_id = path.get("source_node")
    sink_id = path.get("sink_node")
    return source_id is None or sink_id is None or source_id != sink_id


def _validate_concepts(graph: dict[str, Any], node_ids: set[str]) -> None:
    concepts = graph.get("concepts", [])
    if not isinstance(concepts, list):
        _fail("graph.concepts must be an array")
    concept_ids: set[str] = set()
    for index, concept in enumerate(concepts):
        if not isinstance(concept, dict):
            _fail(f"graph.concepts[{index}] must be an object")
        _non_empty_string(concept.get("id"), f"graph.concepts[{index}].id")
        _non_empty_string(concept.get("label"), f"graph.concepts[{index}].label")
        concept_id = concept["id"]
        if concept_id in concept_ids:
            _fail(f"graph.concepts[{index}].id is duplicated")
        concept_ids.add(concept_id)
        node_members = concept.get("node_ids", [])
        if not isinstance(node_members, list) or not all(isinstance(node_id, str) and node_id for node_id in node_members) or len(set(node_members)) != len(node_members):
            _fail(f"graph.concepts[{index}].node_ids must be a unique array")
        if any(node_id not in node_ids for node_id in node_members):
            _fail(f"graph.concepts[{index}].node_ids references an unknown node")
        related = concept.get("related_ids", [])
        if not isinstance(related, list) or not all(isinstance(related_id, str) and related_id for related_id in related) or len(set(related)) != len(related):
            _fail(f"graph.concepts[{index}].related_ids must be a unique array")
        if concept_id in related:
            _fail(f"graph.concepts[{index}].related_ids cannot contain its own ID")
    for index, concept in enumerate(concepts):
        for related_id in concept.get("related_ids", []):
            if related_id not in concept_ids:
                _fail(f"graph.concepts[{index}].related_ids references an unknown concept")


def _validate_understanding_projection(bundle: dict[str, Any], graph: dict[str, Any], node_ids: set[str]) -> None:
    if str(bundle.get("analysis_projection", "")).strip().lower() != "code-understanding":
        return
    entrypoints = graph.get("entrypoints")
    if not isinstance(entrypoints, list) or not entrypoints:
        _fail("code-understanding projections must include graph.entrypoints")
    for index, entrypoint in enumerate(entrypoints):
        if not isinstance(entrypoint, dict) or entrypoint.get("node_id") not in node_ids:
            _fail(f"graph.entrypoints[{index}] must reference a graph node")
    paths = bundle.get("paths") or {}
    nodes = {node["id"]: node for node in graph["nodes"]}
    candidates = [
        *(paths.get("values", paths.get("value_flows", [])) if isinstance(paths, dict) else []),
        *(paths.get("requests", paths.get("request_paths", [])) if isinstance(paths, dict) else []),
    ]
    if not any(_understanding_path_has_source(path, nodes, "values" if isinstance(path, dict) and "steps" in path else "requests") for path in candidates):
        _fail("code-understanding projections need a multi-node source-backed path")


def _validate_graph_hierarchy(graph: dict[str, Any], node_ids: set[str]) -> None:
    modules = graph.get("modules", [])
    if not isinstance(modules, list):
        _fail("graph.modules must be an array")
    module_ids: set[str] = set()
    parents: dict[str, str] = {}
    for index, module in enumerate(modules):
        if not isinstance(module, dict):
            _fail(f"graph.modules[{index}] must be an object")
        _non_empty_string(module.get("id"), f"graph.modules[{index}].id")
        module_id = module["id"]
        if module_id in module_ids:
            _fail(f"graph.modules[{index}].id is duplicated")
        module_ids.add(module_id)
        members = module.get("node_ids", [])
        if not isinstance(members, list) or not all(isinstance(member, str) and member for member in members) or len(set(members)) != len(members):
            _fail(f"graph.modules[{index}].node_ids must be a unique array")
        if any(member not in node_ids for member in members):
            _fail(f"graph.modules[{index}].node_ids references an unknown node")
        parent = module.get("parent_id", module.get("parentId"))
        if parent is not None:
            _non_empty_string(parent, f"graph.modules[{index}].parent_id")
            parents[module_id] = parent
    for module_id, parent in parents.items():
        if parent not in module_ids:
            _fail(f"graph.modules[{module_id}] references an unknown parent module")
        seen: set[str] = set()
        current = module_id
        while current in parents:
            if current in seen:
                _fail("graph.modules contains a parent cycle")
            seen.add(current)
            current = parents[current]

    entrypoints = graph.get("entrypoints", [])
    if not isinstance(entrypoints, list):
        _fail("graph.entrypoints must be an array")
    entrypoint_ids: set[str] = set()
    for index, entrypoint in enumerate(entrypoints):
        if not isinstance(entrypoint, dict):
            _fail(f"graph.entrypoints[{index}] must be an object")
        _non_empty_string(entrypoint.get("id"), f"graph.entrypoints[{index}].id")
        entrypoint_id = entrypoint["id"]
        if entrypoint_id in entrypoint_ids:
            _fail(f"graph.entrypoints[{index}].id is duplicated")
        entrypoint_ids.add(entrypoint_id)
        if entrypoint.get("node_id") is not None and entrypoint["node_id"] not in node_ids:
            _fail(f"graph.entrypoints[{index}] references an unknown node")


def validate_bundle(bundle: Any) -> dict[str, Any]:
    if not isinstance(bundle, dict):
        _fail("bundle must be an object")
    if bundle.get("format") != "lachesis-explorer-bundle" or bundle.get("schema_version") != "2.0":
        _fail("only schema 2.0 graph-first bundles are supported")
    if "analysis_projection" in bundle:
        _non_empty_string(bundle["analysis_projection"], "analysis_projection")

    meta = bundle.get("meta")
    if not isinstance(meta, dict):
        _fail("meta must be an object")
    for key in ("repository", "language", "revision"):
        _non_empty_string(meta.get(key), f"meta.{key}")
    for key in ("lines", "indexed_nodes"):
        if not isinstance(meta.get(key), int) or isinstance(meta[key], bool) or meta[key] < 0:
            _fail(f"meta.{key} must be a non-negative integer")
    if "source_url_template" in meta:
        _validate_source_url_template(meta["source_url_template"])

    graph = bundle.get("graph")
    if not isinstance(graph, dict) or not isinstance(graph.get("nodes"), list) or not graph["nodes"]:
        _fail("graph.nodes must be a non-empty array")
    node_ids: set[str] = set()
    for index, node in enumerate(graph["nodes"]):
        if not isinstance(node, dict):
            _fail(f"graph.nodes[{index}] must be an object")
        for key in ("id", "kind", "label"):
            _non_empty_string(node.get(key), f"graph.nodes[{index}].{key}")
        if not isinstance(node.get("file"), str):
            _fail(f"graph.nodes[{index}].file must be a string")
        if node["id"] in node_ids:
            _fail(f"graph.nodes[{index}].id is duplicated")
        node_ids.add(node["id"])
        if not isinstance(node.get("line"), int) or isinstance(node["line"], bool) or node["line"] < 0:
            _fail(f"graph.nodes[{index}].line must be a non-negative integer")

    edges = graph.get("edges", [])
    if not isinstance(edges, list):
        _fail("graph.edges must be an array")
    for index, edge in enumerate(edges):
        if not isinstance(edge, dict) or edge.get("source") not in node_ids or edge.get("target") not in node_ids:
            _fail(f"graph.edges[{index}] references an unknown node")
    _validate_graph_hierarchy(graph, node_ids)

    paths = bundle.get("paths") or {}
    if not isinstance(paths, dict):
        _fail("paths must be an object")
    value_paths = paths.get("values", paths.get("value_flows", []))
    if not isinstance(value_paths, list):
        _fail("paths.values must be an array")
    value_path_ids: set[str] = set()
    for index, path in enumerate(value_paths):
        if not isinstance(path, dict) or not isinstance(path.get("steps"), list) or not path["steps"]:
            _fail(f"paths.values[{index}] must contain steps")
        for endpoint in ("source_node", "sink_node"):
            if path.get(endpoint) is not None and path[endpoint] not in node_ids:
                _fail(f"paths.values[{index}].{endpoint} references an unknown node")
        if path.get("id") is not None:
            if not isinstance(path["id"], str) or not path["id"] or path["id"] in value_path_ids:
                _fail(f"paths.values[{index}].id is invalid or duplicated")
            value_path_ids.add(path["id"])
        for step in path["steps"]:
            if not isinstance(step, dict) or step.get("node_id") not in node_ids:
                _fail(f"paths.values[{index}] references an unknown node")

    request_paths = paths.get("requests", paths.get("request_paths", []))
    if not isinstance(request_paths, list):
        _fail("paths.requests must be an array")
    request_path_ids: set[str] = set()
    for index, path in enumerate(request_paths):
        if not isinstance(path, dict) or not isinstance(path.get("hops"), list) or not path["hops"]:
            _fail(f"paths.requests[{index}] must contain hops")
        for endpoint in ("source_node", "sink_node"):
            if path.get(endpoint) is not None and path[endpoint] not in node_ids:
                _fail(f"paths.requests[{index}].{endpoint} references an unknown node")
        if path.get("id") is not None:
            if not isinstance(path["id"], str) or not path["id"] or path["id"] in request_path_ids:
                _fail(f"paths.requests[{index}].id is invalid or duplicated")
            request_path_ids.add(path["id"])
        if path.get("entry_node") is not None and path["entry_node"] not in node_ids:
            _fail(f"paths.requests[{index}].entry_node references an unknown node")
        for hop in path["hops"]:
            if not isinstance(hop, dict) or hop.get("node_id") not in node_ids:
                _fail(f"paths.requests[{index}] references an unknown node")

    _validate_curated_tour(meta.get("curated_tour"), value_paths, request_paths, node_ids)
    _validate_concepts(graph, node_ids)

    findings = (bundle.get("security") or {}).get("findings", [])
    if not isinstance(findings, list):
        _fail("security.findings must be an array")
    finding_ids: set[str] = set()
    for finding in findings:
        finding_id = finding.get("finding_id", finding.get("id")) if isinstance(finding, dict) else None
        if finding_id is not None:
            if not isinstance(finding_id, str) or not finding_id or finding_id in finding_ids or finding_id in value_path_ids:
                _fail("security finding IDs must be unique and distinct from value path IDs")
            finding_ids.add(finding_id)
    _validate_understanding_projection(bundle, graph, node_ids)
    return bundle


def validate_file(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as stream:
        return validate_bundle(json.load(stream))


def prepare_file(path: str) -> dict[str, Any]:
    """Canonicalize exporter nulls, validate, and persist the publishable artifact."""
    with open(path, encoding="utf-8") as stream:
        bundle = json.load(stream)
    for node in ((bundle.get("graph") or {}).get("nodes") or []):
        if isinstance(node, dict):
            if node.get("file") is None:
                node["file"] = ""
            if node.get("line") is None:
                node["line"] = 0
    validate_bundle(bundle)
    with open(path, "w", encoding="utf-8") as stream:
        json.dump(bundle, stream, separators=(",", ":"), ensure_ascii=False)
    return bundle
