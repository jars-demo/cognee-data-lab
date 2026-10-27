import ForceGraph from "force-graph";
import { api } from "../api";
import type { App } from "../app";
import { h } from "../dom";
import { logo } from "../logos";
import type { Graph, GraphNode, MemoryId } from "../types";

// cognee's node types get fixed colors so the graph reads the same in every memory.
const TYPE_COLORS: Record<string, string> = {
  Entity: "#1890FF", EntityType: "#13A8A8", TextDocument: "#3F9F5A", DocumentChunk: "#A3AAC2",
  TextSummary: "#F2A23C", Timestamp: "#E05A5A",
};
const LABELLED = new Set(["Entity"]);
const PALETTE = ["#5B7CC4", "#8BBF3F", "#C2569B", "#0F6E8C", "#B7791F"];

interface Node extends GraphNode { x?: number; y?: number; color: string }

function colorFor(types: string[]): (type: string) => string {
  const other = types.filter((t) => !TYPE_COLORS[t]);
  return (type) => TYPE_COLORS[type] ?? PALETTE[Math.max(0, other.indexOf(type)) % PALETTE.length];
}

/** Ids of the largest connected component, so the view fits the graph, not a stray pair. */
function largestComponent(ids: string[], links: { source: string; target: string }[]): Set<string> {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  for (const l of links) parent.set(find(l.source), find(l.target));
  const groups = new Map<string, string[]>();
  for (const id of ids) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);
  return new Set([...groups.values()].sort((a, b) => b.length - a.length)[0] ?? []);
}

function details(node: Node | null): HTMLElement {
  if (!node) {
    return h("div", { class: "muted small" }, "Click a node to see what cognee stored for it.");
  }
  const props = Object.entries(node.properties ?? {})
    .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
    .slice(0, 12);
  return h("div", { class: "node-details" },
    h("span", { class: "type-dot", style: `--c:${node.color}` }, node.type),
    h("h4", {}, node.label || node.id),
    h("dl", {}, ...props.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, String(v).slice(0, 400))])));
}

export function graphView(app: App): HTMLElement {
  let memory: MemoryId = "combined";
  let instance: ForceGraph<Node> | null = null;
  const canvas = h("div", { class: "graph-canvas" });
  const legend = h("div", { class: "legend" });
  const side = h("aside", { class: "card graph-side" });
  const stats = h("span", { class: "muted small" });
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const observer = new ResizeObserver(() =>
    instance?.width(canvas.clientWidth).height(canvas.clientHeight));
  observer.observe(canvas);
  app.onLeave(() => { observer.disconnect(); instance?._destructor(); });

  function paintTabs(): void {
    tabs.replaceChildren(...app.state.memories.map((m) => h("button", {
      class: `tab${m.id === memory ? " active" : ""}`, role: "tab", type: "button",
      onclick: () => { memory = m.id; paintTabs(); load(); },
    }, h("span", { class: "logo-stack" }, ...m.sources.map((s) => logo(s, 18))), m.label)));
  }

  function draw(graph: Graph): void {
    const types = [...new Set(graph.nodes.map((n) => n.type))].sort();
    const color = colorFor(types);
    const nodes: Node[] = graph.nodes.map((n) => ({ ...n, color: color(n.type) }));
    const ids = new Set(nodes.map((n) => n.id));
    const links = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ ...e }));
    const main = largestComponent(nodes.map((n) => n.id), links);
    stats.textContent = `${nodes.length} nodes · ${links.length} edges`;
    legend.replaceChildren(...types.map((t) => h("span", { class: "type-dot", style: `--c:${color(t)}` },
      `${t} · ${nodes.filter((n) => n.type === t).length}`)));
    side.replaceChildren(h("h3", {}, "Node"), details(null));

    if (!nodes.length) {
      instance?._destructor();
      instance = null;
      canvas.replaceChildren(h("div", { class: "empty-state" }, h("h3", {}, "This memory is empty"),
        h("p", {}, "Sync a connector first."), h("a", { class: "btn", href: "#/sync" }, "Go to Sync")));
      return;
    }
    canvas.replaceChildren();
    instance?._destructor();
    instance = new ForceGraph<Node>(canvas)
      .width(canvas.clientWidth)
      .height(canvas.clientHeight)
      .backgroundColor("#ffffff")
      .graphData({ nodes, links })
      .nodeId("id")
      .nodeLabel((n) => `${n.type}: ${n.label}`)
      .nodeColor((n) => n.color)
      .nodeRelSize(6)
      .linkColor(() => "rgba(55,64,102,0.16)")
      .linkLabel((l) => (l as { label: string }).label)
      .linkDirectionalArrowLength(3)
      .linkDirectionalArrowRelPos(1)
      .nodeCanvasObjectMode(() => "after")
      .nodeCanvasObject((n, ctx, scale) => {
        // Name the entities; documents, chunks and summaries have hash names, so only up close.
        if (scale < (LABELLED.has(n.type) ? 0.35 : 2.2)) return;
        ctx.font = `600 ${10 / scale}px Mulish, sans-serif`;
        ctx.fillStyle = "#374066";
        ctx.textAlign = "center";
        ctx.fillText(String(n.label ?? "").slice(0, 32), n.x ?? 0, (n.y ?? 0) + 9 / scale);
      })
      .onNodeClick((n) => side.replaceChildren(h("h3", {}, "Node"), details(n)))
      .cooldownTime(4000)
      .onEngineStop(() => instance?.zoomToFit(500, 40, (n) => main.has(n.id)));
    instance.d3Force("charge")?.strength(-110);
    instance.d3Force("link")?.distance(36);
  }

  async function load(): Promise<void> {
    stats.textContent = "Loading…";
    canvas.replaceChildren(h("div", { class: "empty-state" }, h("span", { class: "spinner big" })));
    try {
      draw(await api.graph(memory));
    } catch (err) {
      canvas.replaceChildren(h("div", { class: "empty-state" }, h("p", {}, (err as Error).message)));
    }
  }

  paintTabs();
  load();
  return h("div", { class: "graph-layout" },
    h("section", { class: "card graph-main" },
      h("div", { class: "card-head" }, tabs, stats), canvas, legend),
    side);
}
