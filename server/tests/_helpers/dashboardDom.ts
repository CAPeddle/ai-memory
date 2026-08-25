/**
 * The smallest DOM the workflow dashboard's inline script actually touches, plus the
 * boot harness that evaluates that script against it.
 *
 * **Why this is a helper rather than a local shim.** It was born inside
 * `workflow-work-item-dashboard.test.ts` (ST-097 B6) and moved here when B9's
 * end-to-end file needed the same thing: two copies of a DOM shim would be two
 * definitions of "what the dashboard is allowed to reach for", and the whole value
 * of the shim being tiny and dumb is that it fails loudly when the page stops being
 * the framework-free single file ST-086 committed to. One copy, one failure point.
 *
 * **What it is not.** Not a browser. Layout, CSS cascade and real event dispatch are
 * out of its reach, and the recorded manual browser procedure in
 * `docs/workflow-mvp.md` remains the only proof of those. Editing
 * `server/src/workflow/dashboard.ts` expires that recorded run — see the anchor note
 * in `workflow-mvp-e2e.test.ts`.
 */

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { DASHBOARD_HTML } from "../../src/workflow/dashboard.ts";

export interface ShimNode {
  tag: string;
  className: string;
  textContent: string;
  children: ShimNode[];
  appendChild(child: ShimNode): ShimNode;
  replaceChildren(...kids: ShimNode[]): void;
  // The existing decision/criteria controls set these; nothing reads them here.
  placeholder?: string;
  size?: number;
  disabled?: boolean;
  value?: string;
  onclick?: () => void;
}

export function makeNode(tag: string): ShimNode {
  const node: ShimNode = {
    tag,
    className: "",
    textContent: "",
    children: [],
    value: "",
    appendChild(child: ShimNode) {
      node.children.push(child);
      return child;
    },
    replaceChildren(...kids: ShimNode[]) {
      node.children = kids;
    },
  };
  return node;
}

/** Serialise a subtree the way a reader would see it: tags, classes and text. */
export function markup(node: ShimNode): string {
  const cls = node.className === "" ? "" : ` class="${node.className}"`;
  const inner = node.textContent + node.children.map(markup).join("");
  return `<${node.tag}${cls}>${inner}</${node.tag}>`;
}

/** The visible text of a subtree, with no markup — what the reader actually reads. */
export function textOf(node: ShimNode): string {
  return node.textContent + node.children.map(textOf).join(" ");
}

/** Every node in a subtree whose class list contains `cls`. */
export function byClass(node: ShimNode, cls: string): ShimNode[] {
  const hit = node.className.split(/\s+/).includes(cls) ? [node] : [];
  return hit.concat(node.children.flatMap((child) => byClass(child, cls)));
}

/**
 * Pull the dashboard's script out of the served page and evaluate it against the
 * shim, returning its `load` function.
 *
 * The script is one function body's worth of top-level statements, so appending a
 * `return` to it hands back a binding declared inside it. Every global the script
 * reaches for is passed as a parameter rather than assigned onto `globalThis`:
 * `sessionStorage` throws in Deno without `--location`, `prompt` blocks on stdin,
 * and shadowing `fetch` by parameter is what keeps this off the network.
 *
 * `overview` is the payload the stubbed fetch answers with. A caller may hand it a
 * hand-built fixture (B6) or the JSON a real running server just returned (B9) —
 * the renderer cannot tell the difference, which is exactly why the second is worth
 * doing.
 */
export function bootDashboard(
  overview: unknown,
): { root: ShimNode; load: () => Promise<void> } {
  const script = extractScript();
  const nodes = new Map<string, ShimNode>();
  for (const id of ["root", "banner", "stamp", "refresh", "rekey"]) {
    nodes.set(id, makeNode("div"));
  }
  const document = {
    getElementById(id: string): ShimNode {
      const node = nodes.get(id);
      assert(node !== undefined, `the dashboard shell must carry #${id}`);
      return node;
    },
    createElement: makeNode,
  };
  const storage = new Map<string, string>([["awcp.apiKey", "test-key"]]);
  const sessionStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  };
  const fetchStub = (_url: string) =>
    Promise.resolve(
      new Response(JSON.stringify(overview), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  const factory = new Function(
    "document",
    "sessionStorage",
    "fetch",
    "prompt",
    script + "\n;return load;",
  );
  const load = factory(document, sessionStorage, fetchStub, () => "test-key");
  return { root: nodes.get("root")!, load };
}

export function extractScript(): string {
  const open = DASHBOARD_HTML.indexOf("<script>");
  const close = DASHBOARD_HTML.lastIndexOf("</script>");
  assert(open !== -1 && close > open, "the dashboard must carry exactly one inline script");
  return DASHBOARD_HTML.slice(open + "<script>".length, close);
}
