/**
 * ST-097 / ADR-017 — the WorkItem contract.
 *
 * These are assertions about the CONTRACT, not smoke: each one pins a clause of
 * ADR-017 that a later edit could quietly reverse. Three of them assert an
 * *absence*, which is unusual and deliberate — §3 and §6 settle what a WorkItem
 * must never carry, and an absence nothing checks is an absence that returns.
 *
 * There is no database here and no DDL anywhere yet. The contract deliberately
 * lands before the storage, so the storage cannot settle the vocabulary by
 * accident.
 */

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  awLabelSchema,
  createWorkItemSchema,
  sourceSystemSchema,
  WORK_ITEM_CONTRACT_VERSION,
  workItemSchema,
} from "../src/workflow/schema.ts";
import { SOURCE_SYSTEMS } from "../src/workflow/types.ts";
import type { CreateWorkItemInput, WorkItem } from "../src/workflow/types.ts";

Deno.test({
  name: "contract: the provenance set is exactly ADR-017 §2's closed four",
  fn: () => {
    assertEquals(
      [...SOURCE_SYSTEMS].sort(),
      ["awcp-native", "github", "jira", "story-board"],
      "widening this set is an amendment to ADR-017 §2, not a call-site edit",
    );
    // The zod enum and the TypeScript union must not drift apart: the enum is built
    // FROM the const, so this proves the const is what the parser actually enforces.
    for (const member of SOURCE_SYSTEMS) {
      assert(sourceSystemSchema.safeParse(member).success, `${member} must parse`);
    }
    assertFalse(
      sourceSystemSchema.safeParse("azure-devops").success,
      "a system outside the closed set must be rejected, not absorbed",
    );
  },
});

Deno.test({
  name: "contract: awcp-native work carries no sourceRef, in both directions",
  fn: () => {
    // §2: "AWCP-native items carry source_system = 'awcp-native' and a null source_ref."
    assert(createWorkItemSchema.safeParse({ sourceSystem: "awcp-native" }).success);
    assert(
      createWorkItemSchema.safeParse({ sourceSystem: "awcp-native", sourceRef: null })
        .success,
    );

    const withRef = createWorkItemSchema.safeParse({
      sourceSystem: "awcp-native",
      sourceRef: "PROJ-1234",
    });
    assertFalse(
      withRef.success,
      "awcp-native names no foreign namespace, so a ref would point nowhere",
    );
    assertEquals(withRef.error?.issues[0].path, ["sourceRef"]);
  },
});

Deno.test({
  name: "contract: every non-native source system requires a sourceRef",
  fn: () => {
    // The pair is a REFERENCE (§2). A jira/github/story-board item with no ref is
    // provenance pointing at nothing, which is the one thing the pair exists to avoid.
    for (const system of SOURCE_SYSTEMS.filter((s) => s !== "awcp-native")) {
      assertFalse(
        createWorkItemSchema.safeParse({ sourceSystem: system }).success,
        `${system} without a sourceRef must be rejected`,
      );
      assertFalse(
        createWorkItemSchema.safeParse({ sourceSystem: system, sourceRef: null }).success,
        `${system} with an explicit null sourceRef must be rejected`,
      );
      assertFalse(
        createWorkItemSchema.safeParse({ sourceSystem: system, sourceRef: "" }).success,
        `${system} with an empty sourceRef must be rejected`,
      );
    }

    // ...and the shapes ADR-017 names as examples must all be accepted.
    for (const [system, ref] of [
      ["jira", "PROJ-1234"],
      ["github", "#57"],
      ["story-board", "ST-097"],
    ] as const) {
      assert(
        createWorkItemSchema.safeParse({ sourceSystem: system, sourceRef: ref }).success,
        `${system}/${ref} is ADR-017's own example and must parse`,
      );
    }
  },
});

Deno.test({
  name: "contract: the creation input cannot carry a minted AW-NNN label",
  fn: () => {
    // §4: AW-NNN is allocated by AWCP's own persistence. "This ADR allocates
    // nothing." A caller-supplied label must not survive parsing — that is the
    // "mint no identifiers" rule made structural rather than remembered.
    const parsed = createWorkItemSchema.parse({
      sourceSystem: "story-board",
      sourceRef: "ST-097",
      awLabel: "AW-1",
    });
    assertFalse("awLabel" in parsed, "a caller-supplied AW label must be stripped");
    assertEquals(Object.keys(parsed).sort(), ["sourceRef", "sourceSystem"]);

    // The parse result is the store input type. Assigning it here is a compile-time
    // assertion that the zod half and the TypeScript half describe one contract.
    const input: CreateWorkItemInput = parsed;
    assertEquals(input.sourceSystem, "story-board");
  },
});

Deno.test({
  name: "contract: the creation input strips scope, status and title too",
  fn: () => {
    // §3 (no Policy Scope holder), §6 (no status), §2 (title's authority is the
    // source's). None of the three is a field, so none of the three can arrive.
    const parsed = createWorkItemSchema.parse({
      sourceSystem: "jira",
      sourceRef: "PROJ-1234",
      policyScope: "corporate",
      status: "in_progress",
      title: "smuggled",
    });
    for (const smuggled of ["policyScope", "status", "title"]) {
      assertFalse(smuggled in parsed, `${smuggled} must not survive parsing`);
    }
  },
});

Deno.test({
  name: "contract: a WorkItem row has no status, no scope, no title (ADR-017 §3, §6)",
  fn: () => {
    // A structural assertion, because §6 is a settled decision rather than a gap:
    // "There is nothing here to design later." A field appearing in this shape is a
    // reversal, and this is the check that says so out loud.
    const shape = Object.keys(workItemSchema.shape);
    for (const forbidden of [
      "status",
      "policy_scope",
      "title",
      "completed_at",
      "attention",
    ]) {
      assertFalse(
        shape.includes(forbidden),
        `a WorkItem must not carry "${forbidden}" — see ADR-017 §3 and §6`,
      );
    }
    assertEquals(
      shape.sort(),
      ["aw_label", "created_at", "id", "source_ref", "source_system", "updated_at"],
      "the row is exactly what §1-§4 enumerate; adding a column is an ADR amendment",
    );
  },
});

Deno.test({
  name: "contract: the row schema and the WorkItem type describe the same row",
  fn: () => {
    const row: WorkItem = {
      id: "3f1a9d2e-4c5b-4a7e-9b1f-0c2d3e4f5a6b",
      source_system: "story-board",
      source_ref: "ST-097",
      aw_label: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const parsed: WorkItem = workItemSchema.parse(row);
    assertEquals(parsed.source_ref, "ST-097");

    // Both secondary identities are nullable and neither is the primary key (§1).
    assert(workItemSchema.safeParse({ ...row, aw_label: "AW-1" }).success);
    assert(
      workItemSchema.safeParse({ ...row, source_system: "awcp-native", source_ref: null })
        .success,
    );
    assertFalse(
      workItemSchema.safeParse({ ...row, id: "ST-097" }).success,
      "the id is a uuid and nothing else is the primary identity",
    );
  },
});

Deno.test({
  name: "contract: the AW label schema validates a format and allocates nothing",
  fn: () => {
    for (const good of ["AW-1", "AW-12", "AW-097"]) {
      assert(awLabelSchema.safeParse(good).success, `${good} must parse`);
    }
    for (const bad of ["ST-097", "AW-", "aw-1", "AW-1a", "AW1", "", "AW-1 "]) {
      assertFalse(awLabelSchema.safeParse(bad).success, `${bad} must not parse`);
    }
    // ST-NNN and AW-NNN are two namespaces with two allocators (§4). The label
    // schema must never accept a development-story id in the AWCP namespace.
    assertFalse(awLabelSchema.safeParse("ST-097").success);
  },
});

Deno.test({
  name: "contract: the contract version tracks ADR-017's revision, not a migration",
  fn: () => {
    // ADR-017 is at revision 1.0. The module had no contract-versioning convention
    // before this, so the constant's meaning is pinned here rather than inferred.
    assertEquals(WORK_ITEM_CONTRACT_VERSION, 1);
  },
});
