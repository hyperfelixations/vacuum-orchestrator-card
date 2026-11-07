// The action contract: every action the card's markup or element names has exactly one handler,
// and every handler is named somewhere in the markup or the element. The router composes its
// handlers from modules by flow; an action two modules claim stops the card.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseAst } = require("rollup/parseAst");
const { visitTree } = require("../architecture/source-architecture.js");

const SRC = path.join(__dirname, "..", "..", "src");
const ACTIONS_DIR = path.join(SRC, "controllers", "runtime", "actions");
const ROUTER = path.join(SRC, "controllers", "runtime", "action-router.js");

// Action names outside the router: `data-action="name"` in markup, `action: "name"` in view models
// and `handle("name")` in the element (`named`); and every string the markup code holds, where an
// action is handed to a helper by name (`mentioned`).
function namedActions() {
  const named = new Set();
  const mentioned = new Set();
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (full !== ACTIONS_DIR) walk(full);
      } else if (entry.name.endsWith(".js") && full !== ROUTER) {
        visitTree(parseAst(fs.readFileSync(full, "utf8")), (node) => {
          const text = node.type === "Literal" && typeof node.value === "string" ? node.value : node.type === "TemplateElement" ? node.value.cooked : null;
          if (text !== null) mentioned.add(text);
          if (text !== null) for (const match of text.matchAll(/data-action="([a-z-]+)"/g)) named.add(match[1]);
          if (node.type === "Property" && !node.computed && node.key.type === "Identifier" && node.key.name === "action" && node.value.type === "Literal") named.add(node.value.value);
          const callee = node.type === "CallExpression" ? node.callee : null;
          if (callee?.type === "MemberExpression" && !callee.computed && callee.property.name === "handle" && node.arguments[0]?.type === "Literal") named.add(node.arguments[0].value);
        });
      }
    }
  };
  walk(SRC);
  return { named, mentioned: new Set([...mentioned, ...named]) };
}

async function handlerNames() {
  const { ACTION_MODULES } = await import("../../src/controllers/runtime/action-router.js");
  return ACTION_MODULES.map((actions) => Object.keys(actions({ ui: {}, lifecycle: {}, holds: {}, editing: {} })));
}

test("every action the card names has a handler and every handler is named", async () => {
  const { named, mentioned } = namedActions();
  const handlers = new Set((await handlerNames()).flat());
  assert.ok(named.size > 60, "the walk finds the card's actions");
  assert.deepEqual([...named].filter((action) => !handlers.has(action)).sort(), [], "named without a handler");
  assert.deepEqual([...handlers].filter((action) => !mentioned.has(action)).sort(), [], "handled but never named");
});

test("each action has one handler, and a second claim stops the card", async () => {
  const { composeHandlers } = await import("../../src/controllers/runtime/action-router.js");
  const all = (await handlerNames()).flat();
  assert.equal(new Set(all).size, all.length);
  assert.throws(() => composeHandlers([{ back: () => {} }, { back: () => {} }]), /"back" is handled twice/);
});
