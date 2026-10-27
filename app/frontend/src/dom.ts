// A tiny element helper: h("div", { class: "card" }, child, "text").

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | boolean | number | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2), value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, ...children);
  return el;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function svg(markup: string): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "svg";
  wrap.innerHTML = markup; // only for the app's own static icon markup
  return wrap;
}

let toastTimer: number | undefined;

export function toast(message: string, kind: "ok" | "error" = "ok"): void {
  let el = document.querySelector<HTMLElement>(".toast");
  if (!el) {
    el = h("div", { class: "toast", role: "status" });
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el?.classList.remove("show"), 3200);
}

/** Run an async action with the button disabled and a spinner shown. */
export async function busy<T>(button: HTMLButtonElement, action: () => Promise<T>): Promise<T> {
  button.disabled = true;
  button.classList.add("loading");
  try {
    return await action();
  } finally {
    button.disabled = false;
    button.classList.remove("loading");
  }
}

export function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h("label", { class: "field" }, h("span", { class: "field-label" }, label), input,
    hint ? h("span", { class: "field-hint" }, hint) : null);
}

export function input(name: string, value = "", attrs: Attrs = {}): HTMLInputElement {
  return h("input", { name, value, autocomplete: "off", spellcheck: "false", ...attrs });
}

/** Read every named input/select inside a form-like element. */
export function values(root: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name], select[name]")
    .forEach((el) => { out[el.name] = el.value.trim(); });
  return out;
}

export function timeAgo(seconds: number | null): string {
  if (!seconds) return "";
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  return new Date(seconds * 1000).toLocaleString();
}
