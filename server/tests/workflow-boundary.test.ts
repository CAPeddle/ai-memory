/**
 * ST-084 spike — criterion 2: separate persistence and API boundary.
 *
 * These tests enforce the module boundary rather than describing it. The
 * dependency rule is checked by scanning the module's own source, so a future
 * edit that reaches into the memory domain fails CI instead of being caught in
 * review (or not at all).
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { sql } from "../src/db.ts";
import * as store from "../src/workflow/store.ts";

const T = { sanitizeResources: false, sanitizeOps: false };

const WORKFLOW_DIR = new URL("../src/workflow/", import.meta.url);
const WORKFLOW_FILES = [
  "types.ts",
  "store.ts",
  "attention.ts",
  "ports.ts",
  "service.ts",
] as const;

async function readWorkflowSource(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const name of WORKFLOW_FILES) {
    out.set(name, await Deno.readTextFile(new URL(name, WORKFLOW_DIR)));
  }
  return out;
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
      const imports = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
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
  name: "boundary: only store.ts holds the database handle",
  fn: async () => {
    const sources = await readWorkflowSource();
    for (const [name, raw] of sources) {
      const code = stripComments(raw);
      const importsDb = /from\s+["']\.\.\/db\.ts["']/.test(code);
      if (name === "store.ts") {
        assert(importsDb, "store.ts is expected to own the database handle");
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
  name: "boundary: migration 007 creates objects only in the workflow schema",
  fn: async () => {
    const migration = await Deno.readTextFile(
      new URL("../db/007_workflow_schema.sql", import.meta.url),
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
        "migration 007 must not add, rename or drop any table in the public (memory) schema",
      );

      const wf = await tx<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'workflow'
        ORDER BY table_name
      `;
      assertEquals(wf.map((r) => r.table_name), [
        "agent_runs",
        "checkpoints",
        "evidence_items",
        "operational_decisions",
        "verification_criteria",
        "work_packets",
      ]);

      throw new Error("__rollback_007_boundary_fixture__");
    }).catch((err) => {
      if ((err as Error).message !== "__rollback_007_boundary_fixture__") throw err;
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
