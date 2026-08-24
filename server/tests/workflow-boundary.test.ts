/**
 * ST-084 spike — criterion 2: separate persistence and API boundary.
 *
 * These tests enforce the module boundary rather than describing it. The
 * dependency rule is checked by scanning the module's own source, so a future
 * edit that reaches into the memory domain fails CI instead of being caught in
 * review (or not at all).
 */

import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import * as store from "../src/workflow/store.ts";
import { ensureWorkflowSchema } from "../src/workflow/schema.ts";

const T = { sanitizeResources: false, sanitizeOps: false };

Deno.test({
  ...T,
  name: "setup: workflow schema applied by the module itself, not the boot chain",
  fn: async () => {
    // The workflow product owns applying its own schema now. Idempotent.
    await ensureWorkflowSchema();
  },
});


const WORKFLOW_DIR = new URL("../src/workflow/", import.meta.url);

/**
 * Enumerate the module's `.ts` files from the DIRECTORY, never a literal list.
 *
 * An earlier version held a hardcoded six-name array. That left this whole file
 * failing OPEN one level above the rule it enforces: a new file added to
 * `server/src/workflow/` was never scanned at all, and nothing noticed. Inverting
 * the import blocklist to an allowlist did not fix the enumeration underneath it —
 * a sound predicate over an unsound input set is still unsound.
 */
async function readTsSources(dir: URL): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    out.set(entry.name, await Deno.readTextFile(new URL(entry.name, dir)));
  }
  if (out.size === 0) throw new Error(`source enumeration found no .ts files in ${dir}`);
  return out;
}

function readWorkflowSource(): Promise<Map<string, string>> {
  return readTsSources(WORKFLOW_DIR);
}

/**
 * Every import form that can reach outside the module. The original regex matched
 * only `from "..."`, so a side-effect import (`import "../entityWorker.ts"`) or a
 * dynamic one (`await import("../entityWorker.ts")`) crossed the boundary unseen.
 */
function extractImportSpecifiers(code: string): string[] {
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g, // static + re-export
    /\bimport\s+["']([^"']+)["']/g, // side-effect
    /\bimport\s*\(\s*["']([^"']+)["']/g, // dynamic
  ];
  const specs: string[] = [];
  for (const re of patterns) specs.push(...[...code.matchAll(re)].map((m) => m[1]));
  return specs;
}

/** Strip line and block comments so prose about the memory domain isn't a false positive. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * The sanctioned import surface. This is an ALLOWLIST, deliberately.
 *
 * An earlier version of this test used a blocklist of eight known memory modules.
 * That is the wrong shape for a boundary: it omitted `../index.ts` (which registers
 * every MCP tool) along with auth/healthCheck/logging/mcpDiagnostics/migrate/
 * workerLogger, so the module could have imported straight from the composition
 * root and this test would still have passed green. Worse, a blocklist over a
 * directory that grows permits every FUTURE memory module by default.
 *
 * Inverted: anything not named here fails. Adding a dependency to the workflow
 * module is now a deliberate, reviewable edit to this list.
 */
const ALLOWED_IMPORTS = [
  "../db.ts", // store.ts only — separately asserted below
  "../logging.ts",
];

/** Relative within the module (`./types.ts`), or a package specifier. */
function isIntraModuleOrPackage(spec: string): boolean {
  if (spec.startsWith("./")) return true;
  return /^(npm:|jsr:|node:|https:)/.test(spec);
}

Deno.test({
  name: "boundary: workflow module imports ONLY from its allowlisted surface",
  fn: async () => {
    const sources = await readWorkflowSource();
    let checked = 0;
    for (const [name, raw] of sources) {
      const code = stripComments(raw);
      const imports = extractImportSpecifiers(code);
      for (const spec of imports) {
        checked++;
        assert(
          isIntraModuleOrPackage(spec) || ALLOWED_IMPORTS.includes(spec),
          `${name} imports "${spec}", which is outside the workflow module's ` +
            `allowlisted surface (${ALLOWED_IMPORTS.join(", ")}, ./*, or a package). ` +
            `If this dependency is intended, add it to ALLOWED_IMPORTS deliberately.`,
        );
      }
    }
    // Guard against the assertion loop passing vacuously if the source read or the
    // import regex ever silently yields nothing.
    assert(checked > 0, "expected to inspect at least one import specifier");
  },
});

Deno.test({
  name: "boundary: the allowlist itself rejects a memory-domain import",
  fn: () => {
    // Red/green control on the mechanism above. Without this, a scan that matched
    // nothing would look identical to a scan that found no violations — the exact
    // silent-pass failure mode this whole test file exists to prevent.
    const violations = [
      "../entityWorker.ts",
      "../consolidationWorker.ts",
      "../searchQuality.ts",
      "../parseContext.ts",
      "../embeddings.ts",
      "../index.ts", // the composition root — missed entirely by the old blocklist
      "../../index.ts",
    ];
    for (const spec of violations) {
      assert(
        !(isIntraModuleOrPackage(spec) || ALLOWED_IMPORTS.includes(spec)),
        `allowlist wrongly permits "${spec}" — the boundary check is not sound`,
      );
    }
    // And it must still permit the legitimate ones, or it would be uselessly strict.
    for (const spec of ["./types.ts", "../db.ts", "../logging.ts", "npm:postgres@3.4.4"]) {
      assert(
        isIntraModuleOrPackage(spec) || ALLOWED_IMPORTS.includes(spec),
        `allowlist wrongly rejects legitimate import "${spec}"`,
      );
    }
  },
});

Deno.test({
  name: "boundary: the import scanner catches side-effect and dynamic import forms",
  fn: () => {
    // Red/green control on extractImportSpecifiers. The original scanner matched only
    // `from "..."`, so both middle forms below crossed the boundary unseen — a
    // violation the allowlist then never got the chance to reject. A sound predicate
    // is worthless if the extraction feeding it is blind.
    const sample = [
      `import { a } from "../db.ts";`,
      `import "../entityWorker.ts";`,
      `const m = await import("../searchQuality.ts");`,
      `export { x } from "./types.ts";`,
    ].join("\n");

    const found = extractImportSpecifiers(sample);
    for (const spec of ["../db.ts", "../entityWorker.ts", "../searchQuality.ts", "./types.ts"]) {
      assert(
        found.includes(spec),
        `scanner missed "${spec}" — the boundary check cannot reject what it cannot see`,
      );
    }

    // ...and the allowlist must then reject the two memory-domain specifiers.
    for (const spec of ["../entityWorker.ts", "../searchQuality.ts"]) {
      assert(
        !(isIntraModuleOrPackage(spec) || ALLOWED_IMPORTS.includes(spec)),
        `allowlist wrongly permits "${spec}"`,
      );
    }
  },
});

Deno.test({
  name: "boundary: source enumeration reads the directory, not a hardcoded list",
  fn: async () => {
    // Control for the enumeration itself. With the previous hardcoded WORKFLOW_FILES
    // array, a file added to the module was never scanned and nothing noticed — the
    // whole boundary check failed open one level above the rule it enforces.
    //
    // Point the SAME function at a different real directory and require it to return
    // that directory's contents. Since readWorkflowSource() is literally
    // readTsSources(WORKFLOW_DIR), a function that reads whatever directory it is
    // handed cannot be carrying a hardcoded workflow file list.
    //
    // (This used to write a probe file into the module directory and assert it was
    // picked up. That version was stronger in principle and broken in practice: CI
    // runs `deno test` with no --allow-write, so it failed there while passing
    // locally. A control that only runs on one machine controls nothing.)
    const elsewhere = await readTsSources(new URL("../src/", import.meta.url));
    for (const expected of ["db.ts", "auth.ts"]) {
      assert(
        elsewhere.has(expected),
        `enumeration did not return ${expected} from server/src/ — it is not ` +
          "reading the directory it was given",
      );
    }
    assert(
      !elsewhere.has("store.ts"),
      "server/src/ must not contain the workflow module's own files — wrong directory read",
    );
  },
});

Deno.test({
  name: "boundary: only store.ts holds the database handle",
  fn: async () => {
    const sources = await readWorkflowSource();
    for (const [name, raw] of sources) {
      const code = stripComments(raw);
      const importsDb = extractImportSpecifiers(code).includes("../db.ts");
      if (name === "store.ts" || name === "schema.ts") {
        assert(importsDb, `${name} is expected to hold the database handle`);
      } else {
        assert(!importsDb, `${name} must not import ../db.ts — route SQL through store.ts`);
      }
    }
  },
});

Deno.test({
  name: "boundary: workflow SQL never references memory-domain objects",
  fn: async () => {
    // The decisive check for "WorkPackets are not stored as thoughts or shards".
    const forbiddenTokens = [
      "thoughts",
      "entity_mentions",
      "entity_extraction_queue",
      "consolidation_queue",
      "consolidation_log",
      "recall_events",
      "recall_queries",
      "feedback_events",
      "worker_runs",
      "memory_graph",
      "cypher(",
      "ag_catalog",
      "vector(",
      "embedding",
    ];
    const sources = await readWorkflowSource();
    for (const [name, raw] of sources) {
      const code = stripComments(raw).toLowerCase();
      for (const token of forbiddenTokens) {
        assert(
          !code.includes(token.toLowerCase()),
          `${name} references memory-domain object "${token}"`,
        );
      }
    }
  },
});

Deno.test({
  name: "boundary: every workflow SQL identifier is schema-qualified",
  fn: async () => {
    // Unqualified DML would land in whichever schema the pooled connection's
    // sticky search_path happens to point at (AGE pollution — see 007 header).
    const code = stripComments(await Deno.readTextFile(new URL("store.ts", WORKFLOW_DIR)));
    // Case-INSENSITIVE deliberately: the original regex had no /i flag, so a
    // lowercase `from thoughts` would have been skipped entirely rather than
    // flagged — a scan that silently ignores the very style it should catch.
    const clauses = [...code.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([A-Za-z_][\w.]*)/gi)];
    assert(clauses.length > 0, "expected SQL clauses in store.ts");
    for (const [, identifier] of clauses) {
      assert(
        identifier.toLowerCase().startsWith("workflow."),
        `unqualified or non-workflow SQL identifier "${identifier}" in store.ts`,
      );
    }
  },
});

Deno.test({
  name: "boundary: the schema-qualification scan catches lowercase and unqualified SQL",
  fn: () => {
    // Red/green control on the scan above, for the same reason as the allowlist
    // control: prove the mechanism fires, not just that it stayed quiet.
    const scan = (code: string) =>
      [...code.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([A-Za-z_][\w.]*)/gi)]
        .map(([, id]) => id)
        .filter((id) => !id.toLowerCase().startsWith("workflow."));

    assertEquals(scan("SELECT * FROM workflow.work_packets"), []);
    assertEquals(scan("select * from workflow.work_packets"), [], "lowercase, qualified");
    assertEquals(scan("SELECT * FROM thoughts"), ["thoughts"], "uppercase, unqualified");
    assertEquals(scan("select * from thoughts"), ["thoughts"], "lowercase, unqualified");
    assertEquals(scan("INSERT INTO public.thoughts"), ["public.thoughts"], "wrong schema");
  },
});

Deno.test({
  ...T,
  name: "boundary: the workflow migration creates objects only in the workflow schema",
  fn: async () => {
    const migration = await Deno.readTextFile(
      new URL("../db/workflow/001_workflow_schema.sql", import.meta.url),
    );
    const publicBefore = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    // Re-apply inside a transaction that is deliberately rolled back, so the
    // shared test database is not mutated by this assertion.
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);

      const publicAfter = await tx<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
        ORDER BY table_name
      `;
      assertEquals(
        publicAfter.map((r) => r.table_name),
        publicBefore.map((r) => r.table_name),
        "the workflow migration must not add, rename or drop any table in the " +
          "public (memory) schema",
      );

      const wf = await tx<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'workflow'
        ORDER BY table_name
      `;
      assertEquals(wf.map((r) => r.table_name), [
        "agent_runs",
        "checkpoints",
        "evidence_items",
        // ST-088 U2: the remote execution node identity and its event log. Both live
        // in the workflow schema for the same reason as everything else here — one
        // DROP SCHEMA is the whole teardown.
        "execution_nodes",
        // ST-097 (migration 005): the observed-session lane and the explicit
        // session-to-work-item claim. Same schema, same one-statement teardown.
        "observed_sessions",
        "operational_decisions",
        "run_events",
        // The module's OWN migration ledger. It lives inside the workflow schema
        // deliberately — writing to the memory domain's public.schema_migrations
        // would reintroduce the shared mutable state this separation exists to
        // avoid, and would leave a row behind after DROP SCHEMA workflow CASCADE.
        "schema_migrations",
        "verification_criteria",
        // ST-097 (migration 005): the claim table, and the WorkItem layer above the
        // packet (ADR-017). `work_packets` gains only a nullable `work_item_id`.
        "work_item_sessions",
        "work_items",
        "work_packets",
      ]);

      throw new Error("__rollback_workflow_boundary_fixture__");
    }).catch((err) => {
      if ((err as Error).message !== "__rollback_workflow_boundary_fixture__") throw err;
    });
  },
});

Deno.test({
  ...T,
  name: "boundary: operational rows live in workflow tables, never in thoughts",
  fn: async () => {
    const packet = await store.createPacket({
      title: "boundary probe packet",
      objective: "must not appear in the memory domain",
      policyScope: "personal",
    });
    try {
      const [{ n: inWorkflow }] = await sql<{ n: string }[]>`
        SELECT count(*) AS n FROM workflow.work_packets WHERE id = ${packet.id}
      `;
      assertEquals(Number(inWorkflow), 1);

      // The packet's text must not have been written into the memory domain.
      const [{ n: inThoughts }] = await sql<{ n: string }[]>`
        SELECT count(*) AS n FROM public.thoughts
        WHERE content LIKE ${"%boundary probe packet%"}
           OR content LIKE ${"%must not appear in the memory domain%"}
      `;
      assertEquals(
        Number(inThoughts),
        0,
        "creating a WorkPacket must not create a thought",
      );
    } finally {
      await store.deletePacket(packet.id);
    }
  },
});

Deno.test({
  ...T,
  name: "boundary: workflow tables carry no foreign key into the memory domain",
  fn: async () => {
    const fks = await sql<{ table_name: string; foreign_schema: string }[]>`
      SELECT tc.table_name, ccu.table_schema AS foreign_schema
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.constraint_schema = tc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'workflow'
    `;
    assert(fks.length > 0, "expected intra-workflow foreign keys to exist");
    for (const fk of fks) {
      assertEquals(
        fk.foreign_schema,
        "workflow",
        `workflow.${fk.table_name} has a foreign key into schema "${fk.foreign_schema}" — ` +
          "operational state must not be structurally dependent on the memory domain",
      );
    }
  },
});

Deno.test({
  ...T,
  name: "boundary: promoted_memory_ref is a nullable pointer, not a constraint",
  fn: async () => {
    // Criterion 3 depends on this: the memory projection may vanish without
    // invalidating the decision, so the reference must not be a foreign key.
    const [col] = await sql<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'workflow'
        AND table_name = 'operational_decisions'
        AND column_name = 'promoted_memory_ref'
    `;
    assertEquals(col.is_nullable, "YES");
  },
});

Deno.test({
  name: "boundary: the workflow module never terminates the process",
  fn: async () => {
    // "A product module reports failure; it does not own process termination."
    //
    // The original spike put its DDL in the shared migration chain, whose runner
    // calls Deno.exit(1) before Deno.serve — so a malformed WORKFLOW migration would
    // have killed the whole server, memory domain included. That is the same
    // coupling this spike claims not to have, in the opposite direction.
    const sources = await readWorkflowSource();
    for (const [name, raw] of sources) {
      const code = stripComments(raw);
      for (const forbidden of ["Deno.exit", "Deno.kill", "process.exit"]) {
        assert(
          !code.includes(forbidden),
          `${name} calls ${forbidden} — a product module must report failure to the ` +
            "composition root, not decide the process's fate",
        );
      }
    }
  },
});

Deno.test({
  name: "boundary: workflow DDL is outside the shared boot-blocking migration chain",
  fn: async () => {
    // The shared runner discovers ^(\d+)_.*\.sql$ directly in server/db/ and is
    // awaited before Deno.serve. Workflow DDL living in a subdirectory is what keeps
    // a bad workflow migration from being a whole-server outage.
    const shared: string[] = [];
    for await (const entry of Deno.readDir(new URL("../db/", import.meta.url))) {
      if (entry.isFile && /^(\d+)_.*\.sql$/.test(entry.name)) shared.push(entry.name);
    }
    assert(shared.length > 0, "expected to find the memory domain's own migrations");
    for (const name of shared) {
      assert(
        !name.toLowerCase().includes("workflow"),
        `${name} puts workflow DDL in the shared boot-blocking chain`,
      );
    }
    // ...and it really does exist where the workflow module owns it.
    const owned = await Deno.stat(new URL("../db/workflow/001_workflow_schema.sql", import.meta.url));
    assert(owned.isFile);
  },
});

// "A failed workflow migration REPORTS a typed error, it does not exit" used to live
// here. It moved to workflow-migrations.test.ts, for two reasons: it needed to write a
// fixture file (CI grants no --allow-write, so it failed there while passing locally),
// and it proved the property against a hand-rolled `sql.begin` rather than against the
// module's actual runner. Its replacement drives `applyMigrations` with a broken
// migration and asserts the typed MigrationApplyError, the preserved cause, and that
// the preceding migration stayed applied.

Deno.test({
  ...T,
  name: "schema: ensureWorkflowSchema is idempotent",
  fn: async () => {
    await ensureWorkflowSchema();
    await ensureWorkflowSchema();
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'workflow'
      ORDER BY table_name
    `;
    assertEquals(rows.map((r) => r.table_name), [
      "agent_runs",
      "checkpoints",
      "evidence_items",
      "execution_nodes", // ST-088 U2
      "observed_sessions", // ST-097 migration 005
      "operational_decisions",
      "run_events", // ST-088 U2
      "schema_migrations",
      "verification_criteria",
      "work_item_sessions", // ST-097 migration 005
      "work_items", // ST-097 migration 005 (ADR-017)
      "work_packets",
    ]);
  },
});
