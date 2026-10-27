import { api } from "../api";
import { type App, airflowReady, datahubReady, llmReady } from "../app";
import { append, busy, h, svg, timeAgo, toast } from "../dom";
import { icons } from "../icons";
import { brandName, logo } from "../logos";
import type { Doc, Job, MemoryId, SourceId } from "../types";

const WHAT: Record<SourceId, string> = {
  airflow: "One document per DAG (tasks, order, owners, assets) and one per DAG's recent runs.",
  datahub: "One document per dataset (schema, owners, domain, tags, terms, upstream lineage).",
};

const STATE_LABEL: Record<Job["state"], string> = {
  idle: "Not synced yet", running: "Syncing", done: "Synced", failed: "Failed",
};

function jobBadge(job: Job): HTMLElement {
  return h("span", { class: `badge state-${job.state}` },
    job.state === "running" ? h("span", { class: "spinner" }) : null,
    job.state === "done" ? svg(icons.check) : null,
    job.state === "failed" ? svg(icons.x) : null,
    STATE_LABEL[job.state]);
}

function sourceCard(app: App, id: SourceId, ready: boolean, onSync: () => void): HTMLElement {
  const job = app.state.jobs[id];
  const button = h("button", { class: "btn primary", disabled: !ready || job.state === "running" },
    svg(icons.sync), job.state === "done" ? "Sync again" : "Sync now");
  button.addEventListener("click", () => busy(button, async () => {
    try {
      await api.sync(id);
      onSync();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }));
  const memories = app.state.memories.filter((m) => m.sources.includes(id)).map((m) => m.dataset);
  return h("section", { class: `card sync-card source-${id}` },
    h("div", { class: "card-head" },
      h("div", { class: "card-title" }, logo(id, 40),
        h("div", {}, h("h3", {}, brandName(id)), h("p", {}, WHAT[id]))),
      jobBadge(job)),
    h("div", { class: "sync-target" }, "Writes into ", ...memories.map((m) => h("code", {}, m))),
    job.steps.length ? h("ol", { class: "job-steps" }, ...job.steps.map((s) => h("li", {}, s))) : null,
    job.error ? h("div", { class: "result", "data-ok": "false" }, svg(icons.x), h("span", {}, job.error)) : null,
    h("div", { class: "actions" }, button,
      ready ? null : h("a", { href: "#/connect", class: "link" }, "Connect first"),
      job.finished_at ? h("small", { class: "muted" }, `Last finished ${timeAgo(job.finished_at)}`) : null));
}

function docRow(doc: Doc): HTMLElement {
  const title = doc.url
    ? h("a", { href: doc.url, target: "_blank", rel: "noopener" }, doc.title, svg(icons.external))
    : h("span", {}, doc.title);
  return h("li", { class: "doc" }, logo(doc.source ?? "", 20),
    h("span", { class: "doc-body" }, title, h("small", {}, doc.external_id ?? "")));
}

function memoriesPanel(app: App, docs: Record<MemoryId, Doc[]> | null): HTMLElement {
  return h("section", { class: "card" },
    h("div", { class: "card-head" }, h("div", {}, h("h3", {}, "What each memory holds"),
      h("p", {}, "Every entry is a connector document, with the id it was ingested under."))),
    h("div", { class: "memory-cols" }, ...app.state.memories.map((m) => {
      const list = docs?.[m.id] ?? [];
      return h("div", { class: `memory-col${m.id === "combined" ? " highlight" : ""}` },
        h("div", { class: "memory-col-head" },
          h("span", { class: "logo-stack" }, ...m.sources.map((s) => logo(s, 22))),
          h("b", {}, m.label), h("span", { class: "count" }, docs ? String(list.length) : "…")),
        h("code", { class: "muted" }, m.dataset),
        docs && !list.length ? h("p", { class: "muted small" }, "Empty. Sync to fill it.") : null,
        h("ul", { class: "docs" }, ...list.map(docRow)));
    })));
}

export function syncView(app: App): HTMLElement {
  const root = h("div", { class: "stack" });
  let docs: Record<MemoryId, Doc[]> | null = null;
  let timer: number | undefined;
  app.onLeave(() => window.clearTimeout(timer));

  const ready = { airflow: airflowReady(app.state), datahub: datahubReady(app.state) };
  const running = () => Object.values(app.state.jobs).some((j) => j.state === "running");

  function paint(): void {
    root.replaceChildren();
    append(root,
      llmReady(app.state) ? null : h("div", { class: "banner" }, svg(icons.key),
        "Syncing uses your AI model to build the graph. ", h("a", { href: "#/connect" }, "Choose one first.")),
      h("div", { class: "grid-2 wide" },
        sourceCard(app, "airflow", ready.airflow && llmReady(app.state), poll),
        sourceCard(app, "datahub", ready.datahub && llmReady(app.state), poll)),
      memoriesPanel(app, docs));
  }

  async function loadDocs(): Promise<void> {
    docs = await api.documents().catch(() => null);
    paint();
  }

  async function poll(): Promise<void> {
    window.clearTimeout(timer);
    const wasRunning = running();
    await app.refresh();
    paint();
    if (running()) {
      timer = window.setTimeout(poll, 2000);
    } else if (wasRunning || docs === null) {
      await loadDocs();
    }
  }

  paint();
  loadDocs();
  if (running()) poll();
  return root;
}
