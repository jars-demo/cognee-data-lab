import { api } from "../api";
import { type App, airflowReady, datahubReady, llmReady } from "../app";
import { h, svg } from "../dom";
import { icons } from "../icons";
import { logo } from "../logos";

function sourceCard(id: string, title: string, knows: string, items: string[]): HTMLElement {
  return h("div", { class: "flow-source" },
    h("div", { class: "flow-source-head" }, logo(id, 36), h("div", {}, h("b", {}, title),
      h("small", {}, knows))),
    h("ul", { class: "ticks" }, ...items.map((i) => h("li", {}, i))));
}

function flow(): HTMLElement {
  return h("section", { class: "card" },
    h("div", { class: "card-head" }, h("div", {},
      h("span", { class: "eyebrow" }, "How it fits together"),
      h("h3", {}, "Two sources, one memory"))),
    h("div", { class: "flow" },
      h("div", { class: "flow-sources" },
        sourceCard("airflow", "Airflow connector", "What runs, and what broke",
          ["DAGs, tasks and their order", "Owners, schedules, retries",
            "Assets each task reads and writes", "Recent runs and failures"]),
        sourceCard("datahub", "DataHub connector", "What the data means, and who owns it",
          ["Datasets and schemas", "Owners, domains, tags", "Glossary terms and PII flags",
            "Upstream lineage"])),
      h("div", { class: "flow-arrow" }, svg(icons.arrow)),
      h("div", { class: "flow-core" }, logo("cognee", 48), h("b", {}, "cognee memory"),
        h("small", {}, "Joined on the dataset's real name"),
        h("code", {}, "retail_demo.analytics.daily_revenue")),
      h("div", { class: "flow-arrow" }, svg(icons.arrow)),
      h("div", { class: "flow-memories" },
        memory(["airflow"], "Airflow only", "lab_airflow"),
        memory(["datahub"], "DataHub only", "lab_datahub"),
        memory(["airflow", "datahub"], "Airflow + DataHub", "lab_combined", true))));
}

function memory(sources: string[], label: string, dataset: string, highlight = false): HTMLElement {
  return h("div", { class: `flow-memory${highlight ? " highlight" : ""}` },
    h("span", { class: "logo-stack" }, ...sources.map((s) => logo(s, 22))),
    h("span", { class: "flow-memory-text" }, h("b", {}, label), h("code", {}, dataset)));
}

function stats(app: App): HTMLElement {
  const cells = app.state.memories.map((m) => {
    const value = h("b", {}, "–");
    return { id: m.id, el: h("div", { class: "stat" }, h("small", {}, m.label), value,
      h("span", { class: "muted small" }, "documents")), value };
  });
  api.documents().then((docs) => cells.forEach((c) => { c.value.textContent = String(docs[c.id]?.length ?? 0); }))
    .catch(() => undefined);
  return h("div", { class: "stats" }, ...cells.map((c) => c.el));
}

function step(n: number, title: string, text: string, done: boolean, route: string, app: App) {
  return h("button", { class: `step${done ? " done" : ""}`, onclick: () => app.go(route) },
    h("span", { class: "step-num" }, done ? svg(icons.check) : String(n)),
    h("span", { class: "step-body" }, h("b", {}, title), h("small", {}, text)),
    svg(icons.arrow));
}

export function overviewView(app: App): HTMLElement {
  const s = app.state;
  const synced = s.jobs.airflow.state === "done" && s.jobs.datahub.state === "done";
  return h("div", { class: "stack" },
    h("section", { class: "hero card" },
      h("div", { class: "hero-text" },
        h("span", { class: "eyebrow" }, "cognee-community connectors"),
        h("h2", {}, "Airflow knows what runs. DataHub knows what it means. ",
          h("span", { class: "accent" }, "cognee connects them.")),
        h("p", {}, "Agents that operate a data platform need both: the pipeline that failed, and the ",
          "dataset, owner and lineage it affects. These connectors load each system into cognee ",
          "memory, so one question can be answered across both."),
        h("div", { class: "hero-actions" },
          h("button", { class: "btn primary", onclick: () => app.go("connect") }, "Get started",
            svg(icons.arrow)),
          h("button", { class: "btn", onclick: () => app.go("ask") }, "Ask a question"))),
      h("div", { class: "hero-logos" }, logo("airflow", 64), h("span", { class: "plus" }, "+"),
        logo("datahub", 64), h("span", { class: "plus" }, svg(icons.arrow)), logo("cognee", 64))),
    stats(app),
    flow(),
    h("section", { class: "card" },
      h("div", { class: "card-head" }, h("div", {}, h("span", { class: "eyebrow" }, "Get started"),
        h("h3", {}, "Four steps"))),
      h("div", { class: "steps" },
        step(1, "Choose your AI model", "Paste a key from any provider and pick a model it can use.",
          llmReady(s), "connect", app),
        step(2, "Connect Airflow and DataHub", "Test both connections. Read-only.",
          airflowReady(s) && datahubReady(s), "connect", app),
        step(3, "Sync into memory", "Each connector writes into its own memory and into the shared one.",
          synced, "sync", app),
        step(4, "Ask and compare", "Same question, three memories, with the evidence behind each answer.",
          false, "ask", app))));
}
