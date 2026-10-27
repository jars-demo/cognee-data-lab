import { api } from "../api";
import type { App } from "../app";
import { busy, field, h, input, svg, toast, values } from "../dom";
import { icons } from "../icons";
import { logo } from "../logos";
import type { SourceId } from "../types";

const SAVED = "Saved. Leave blank to keep it";
const DOCKER_HINT = "Lab in Docker? Reach services on your machine at host.docker.internal.";

function status(): HTMLElement {
  return h("div", { class: "result", hidden: true });
}

function showStatus(el: HTMLElement, ok: boolean, text: string): void {
  el.hidden = false;
  el.dataset.ok = String(ok);
  el.replaceChildren(svg(ok ? icons.check : icons.x), h("span", {}, text));
}

// -- AI provider --------------------------------------------------------------

function llmCard(app: App): HTMLElement {
  const saved = app.state.settings.llm;
  const providers = app.state.providers;
  let selected = saved.provider || "openai";

  const grid = h("div", { class: "provider-grid", role: "radiogroup" });
  const key = input("api_key", "", { type: "password" });
  const endpoint = input("endpoint", saved.endpoint);
  const endpointField = field("Endpoint", endpoint, "Where your Ollama server listens.");
  const model = input("model", saved.model, { list: "model-list", placeholder: "Load models, then pick one" });
  const list = h("datalist", { id: "model-list" });
  const count = h("span", { class: "field-hint" });
  const result = status();

  function paint(): void {
    const p = providers[selected];
    grid.querySelectorAll<HTMLElement>(".provider").forEach((el) => {
      el.classList.toggle("selected", el.dataset.id === selected);
      el.setAttribute("aria-checked", String(el.dataset.id === selected));
    });
    const hasSaved = saved.has_api_key && saved.provider === selected;
    key.placeholder = hasSaved ? SAVED : `Your ${p.label} API key`;
    key.closest(".field")!.toggleAttribute("hidden", !p.key);
    endpointField.toggleAttribute("hidden", !p.endpoint);
    if (p.endpoint && !endpoint.value) endpoint.value = p.endpoint;
  }

  for (const [id, p] of Object.entries(providers)) {
    grid.appendChild(h("button", {
      class: "provider", role: "radio", "data-id": id, type: "button",
      onclick: () => {
        if (selected !== id) { model.value = ""; list.replaceChildren(); count.textContent = ""; }
        selected = id;
        paint();
      },
    }, logo(id, 34), h("span", {}, p.label.replace(" (local)", "")),
    p.key ? null : h("small", {}, "local, no key")));
  }

  const load = h("button", { class: "btn", type: "button" }, svg(icons.sync), "Load models");
  load.addEventListener("click", () => busy(load, async () => {
    try {
      const { models } = await api.models(selected, key.value.trim(), endpoint.value.trim());
      list.replaceChildren(...models.map((m) => h("option", { value: m })));
      count.textContent = `${models.length} models available to this key. Type to filter.`;
      if (!models.includes(model.value)) model.value = models[0] ?? "";
      model.focus();
    } catch (err) {
      showStatus(result, false, (err as Error).message);
    }
  }));

  const save = h("button", { class: "btn primary", type: "button" }, "Save model");
  save.addEventListener("click", () => busy(save, async () => {
    const v = values(form);
    if (!v.model) return showStatus(result, false, "Load the models and pick one first.");
    await api.saveSettings("llm", { provider: selected, ...v });
    await app.refresh();
    showStatus(result, true, `cognee will use ${providers[selected].label} · ${v.model}`);
    toast("AI model saved");
  }));

  const form = h("div", { class: "form" },
    field("API key", key, "Stored on this machine only, never sent back to the page."),
    endpointField,
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Model"),
      h("div", { class: "row" }, model, load), list, count));

  paint();
  return h("section", { class: "card connect-card" },
    h("div", { class: "card-head" },
      h("div", { class: "card-title" }, h("span", { class: "icon-tile" }, svg(icons.key)),
        h("div", {}, h("h3", {}, "Add your AI provider"),
          h("p", {}, "Bring your own key. The lab lists the models that key can use."))),
      saved.model ? h("span", { class: "badge ok" }, svg(icons.check), saved.model) : null),
    grid, form,
    h("div", { class: "actions" }, save, result),
    h("p", { class: "note" }, "Embeddings run locally (fastembed, BAAI/bge-small-en-v1.5), so only the ",
      "chat model needs a key."));
}

// -- Sources ------------------------------------------------------------------

interface SourceSpec {
  id: SourceId;
  title: string;
  blurb: string;
  fields: (s: App["state"]["settings"]) => HTMLElement[];
  scope: (s: App["state"]["settings"]) => HTMLElement[];
}

const SOURCES: SourceSpec[] = [
  {
    id: "airflow",
    title: "Connect your Airflow",
    blurb: "Airflow 3.x REST API. Reads DAGs, tasks, assets and recent runs.",
    fields: ({ airflow: a }) => [
      field("Airflow URL", input("url", a.url, { placeholder: "http://localhost:8088" }), DOCKER_HINT),
      h("div", { class: "grid-2" },
        field("Username", input("username", a.username)),
        field("Password", input("password", "", { type: "password", placeholder: a.has_password ? SAVED : "" }))),
      field("API token (optional)", input("token", "", { type: "password", placeholder: a.has_token ? SAVED : "" }),
        "Use instead of username and password."),
    ],
    scope: ({ airflow: a }) => [
      field("DAG id pattern", input("dag_id_pattern", a.dag_id_pattern, { placeholder: "e.g. retail_%" })),
      field("Tags", input("tags", a.tags, { placeholder: "comma separated" })),
    ],
  },
  {
    id: "datahub",
    title: "Connect your DataHub",
    blurb: "DataHub GraphQL API. Reads datasets, schemas, owners, glossary and lineage.",
    fields: ({ datahub: d }) => [
      h("div", { class: "grid-2" },
        field("GMS URL", input("url", d.url, { placeholder: "http://localhost:8080" }), DOCKER_HINT),
        field("Frontend URL", input("frontend_url", d.frontend_url, { placeholder: "http://localhost:9002" }),
          "Used for links back to DataHub.")),
      field("Personal access token", input("token", "", { type: "password", placeholder: d.has_token ? SAVED : "" })),
    ],
    scope: ({ datahub: d }) => [
      field("Platforms", input("platforms", d.platforms, { placeholder: "e.g. postgres" })),
      field("Domains", input("domains", d.domains, { placeholder: "domain URNs, comma separated" })),
    ],
  },
];

function sourceCard(app: App, spec: SourceSpec): HTMLElement {
  const result = status();
  const form = h("div", { class: "form" }, ...spec.fields(app.state.settings),
    h("details", { class: "scope" }, h("summary", {}, "Narrow the scope (optional)"),
      h("div", { class: "grid-2" }, ...spec.scope(app.state.settings))));

  const test = h("button", { class: "btn primary", type: "button" }, "Save and test");
  test.addEventListener("click", () => busy(test, async () => {
    await api.saveSettings(spec.id, values(form));
    const res = await api.test(spec.id);
    showStatus(result, res.ok, res.detail);
    form.querySelectorAll<HTMLInputElement>("input[type=password]").forEach((el) => {
      if (el.value) { el.value = ""; el.placeholder = SAVED; }
    });
    await app.refresh();
  }));

  return h("section", { class: `card connect-card source-${spec.id}` },
    h("div", { class: "card-head" },
      h("div", { class: "card-title" }, logo(spec.id, 40),
        h("div", {}, h("h3", {}, spec.title), h("p", {}, spec.blurb))),
      h("span", { class: "badge" }, "read-only")),
    form, h("div", { class: "actions" }, test, result));
}

export function connectView(app: App): HTMLElement {
  return h("div", { class: "stack" }, llmCard(app),
    h("div", { class: "grid-2 wide" }, ...SOURCES.map((s) => sourceCard(app, s))));
}
