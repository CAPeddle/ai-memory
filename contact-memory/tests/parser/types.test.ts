import {
  type ContactExtraction,
  createContactShardCandidates,
  type ExtractionItem,
  isContactShardCandidate,
  isExtractionItem,
  isReviewDecision,
  makeContactTag,
  type ReviewDecision,
  validateContactExtraction,
  validateContactShardCandidate,
  validateExtractionItem,
  validateReviewDecision,
  validateWhatsAppChat,
} from "../../parser/types.ts";
import {
  ensureValidatedTags,
  isTagValidationError,
} from "../../../shared/tagGrammar.ts";

const evidence = [{ message_ids: ["m1"], quote: "Dinner on Friday" }];

function personTarget(display_name = "Sarah Connor") {
  const contact_tag = makeContactTag(display_name);
  if (!contact_tag.ok) throw new Error(contact_tag.message);
  return {
    kind: "person" as const,
    display_name,
    contact_tag: contact_tag.value,
  };
}

function commitment(overrides: Partial<ExtractionItem> = {}): ExtractionItem {
  return {
    kind: "commitment",
    item_id: "item-1",
    extraction_id: "extraction-1",
    confidence: 0.91,
    target: personTarget(),
    evidence,
    summary: "Sarah committed to bring dessert.",
    ...overrides,
  } as ExtractionItem;
}

function baseItem(item_id: string) {
  return {
    item_id,
    extraction_id: "extraction-1",
    confidence: 0.91,
    target: personTarget(),
    evidence,
  };
}

function extraction(
  items: ExtractionItem[] = [commitment()],
): ContactExtraction {
  return {
    extraction_id: "extraction-1",
    session_id: "session-1",
    source_chat: { session_id: "session-1", kind: "one_to_one" },
    items,
  };
}

function decision(overrides: Partial<ReviewDecision> = {}): ReviewDecision {
  return {
    decision_id: "decision-1",
    extraction_id: "extraction-1",
    item_id: "item-1",
    outcome: "approve",
    reviewed_at: "2026-06-29T12:00:00Z",
    reviewer_context: "local-review",
    ...overrides,
  } as ReviewDecision;
}

Deno.test("WhatsAppChat validates parser output without AI fields", () => {
  const result = validateWhatsAppChat({
    session_id: "session-1",
    kind: "one_to_one",
    messages: [
      {
        message_id: "m1",
        timestamp: "2026-06-29T10:00:00Z",
        sender: "Chris",
        body: "Hi",
      },
      {
        message_id: "m2",
        timestamp: "2026-06-29T10:01:00Z",
        sender: "Sarah",
        body: "Hello",
      },
    ],
    date_range: { start: "2026-06-29", end: "2026-06-29" },
  });
  if (!result.ok) throw new Error(result.message);
  if (
    validateWhatsAppChat({
      session_id: "session-1",
      kind: "one_to_one",
      messages: [
        {
          message_id: "",
          timestamp: "2026-06-29T10:00:00Z",
          sender: "Chris",
          body: "Hi",
        },
      ],
    }).ok
  ) throw new Error("Expected empty message_id to fail");
  if (
    validateWhatsAppChat({
      session_id: "session-1",
      kind: "one_to_one",
      messages: [],
    }).ok !== true
  ) {
    throw new Error(
      "Expected otherwise-valid chat with zero messages to validate",
    );
  }
  if (
    validateWhatsAppChat({
      session_id: "session-1",
      kind: "one_to_one",
      messages: [],
      date_range: { start: "2026-06-30", end: "2026-06-29" },
    }).ok
  ) throw new Error("Expected inverted date_range to fail");
});

Deno.test("ContactExtraction is review-only and accepts zero items", () => {
  const result = validateContactExtraction({
    extraction_id: "extraction-empty",
    session_id: "session-1",
    items: [],
  });
  if (!result.ok) throw new Error(result.message);
});

Deno.test("ContactExtraction rejects platform shard fields", () => {
  const result = validateContactExtraction({
    ...extraction(),
    content: "persist me",
  });
  if (result.ok) {
    throw new Error("Expected platform shard fields to be rejected");
  }
  const profile = validateContactExtraction({
    ...extraction(),
    profile: "personal",
  });
  if (profile.ok) {
    throw new Error("Expected top-level profile field to be rejected");
  }
});

Deno.test("approve decision for one item yields exactly one ContactShard candidate", () => {
  const result = createContactShardCandidates({
    extraction: extraction(),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (!result.ok) throw new Error(result.message);
  if (result.value.length !== 1) {
    throw new Error(`Expected one candidate, got ${result.value.length}`);
  }
  if (!isContactShardCandidate(result.value[0])) {
    throw new Error("Candidate should carry shard-candidate brand");
  }
  if (result.value[0].source !== "whatsapp_export") {
    throw new Error("Expected Contact-domain source value");
  }
  if (!result.value[0].tags.includes("contact" as never)) {
    throw new Error(
      `Expected contact tag, got ${JSON.stringify(result.value[0].tags)}`,
    );
  }
});

Deno.test("edit decision validates replacement item before shard creation", () => {
  const replacement = commitment({ summary: "Sarah committed to bring cake." });
  const result = createContactShardCandidates({
    extraction: extraction(),
    decisions: [
      decision(
        {
          outcome: "edit",
          replacement_item: replacement,
          edit_rationale: "Clarified dessert.",
        } as Partial<ReviewDecision>,
      ),
    ],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (!result.ok) throw new Error(result.message);
  if (!result.value[0].content.includes("cake")) {
    throw new Error(`Expected edited content, got ${result.value[0].content}`);
  }
  if (result.value[0].review.outcome !== "edit") {
    throw new Error("Expected edit provenance");
  }
  if (result.value[0].review.decision_id !== "decision-1") {
    throw new Error("Expected decision provenance to be preserved");
  }
  if (result.value[0].review.edit_rationale !== "Clarified dessert.") {
    throw new Error("Expected edit rationale to be preserved");
  }
});

Deno.test("reject decision yields zero ContactShard candidates", () => {
  const result = createContactShardCandidates({
    extraction: extraction(),
    decisions: [
      decision(
        { outcome: "reject", rejection_reason: "Not useful" } as Partial<
          ReviewDecision
        >,
      ),
    ],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (!result.ok) throw new Error(result.message);
  if (result.value.length !== 0) {
    throw new Error(`Expected no candidates, got ${result.value.length}`);
  }
});

Deno.test("multiple approved items yield one candidate per approved item", () => {
  const second = commitment({
    item_id: "item-2",
    summary: "Sarah likes hiking.",
  });
  const result = createContactShardCandidates({
    extraction: extraction([commitment(), second]),
    decisions: [
      decision({ item_id: "item-2", decision_id: "decision-2" }),
      decision(),
    ],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (!result.ok) throw new Error(result.message);
  if (result.value.length !== 2) {
    throw new Error(`Expected two candidates, got ${result.value.length}`);
  }
});

Deno.test("review decisions reference extraction ID and item ID, not array position", () => {
  const result = createContactShardCandidates({
    extraction: extraction([
      commitment({ item_id: "item-2" }),
      commitment({ item_id: "item-1" }),
    ]),
    decisions: [decision({ item_id: "item-1" })],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (!result.ok) throw new Error(result.message);
  if (result.value[0].item_id !== "item-1") {
    throw new Error(`Expected item-1, got ${result.value[0].item_id}`);
  }
});

Deno.test("unknown item decisions and duplicate decisions are invalid", () => {
  const unknown = createContactShardCandidates({
    extraction: extraction(),
    decisions: [decision({ item_id: "missing" })],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (unknown.ok) throw new Error("Expected unknown item decision to fail");
  const duplicate = createContactShardCandidates({
    extraction: extraction(),
    decisions: [decision(), decision({ decision_id: "decision-2" })],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (duplicate.ok) throw new Error("Expected duplicate decision to fail");
});

Deno.test("edited item must preserve item identity, kind, and evidence", () => {
  const changedItemId = createContactShardCandidates({
    extraction: extraction(),
    decisions: [
      decision({
        outcome: "edit",
        edit_rationale: "Wrong item",
        replacement_item: commitment({ item_id: "item-2" }),
      } as Partial<ReviewDecision>),
    ],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (changedItemId.ok) throw new Error("Expected item ID change to fail");
  const changedExtractionId = createContactShardCandidates({
    extraction: extraction(),
    decisions: [
      decision({
        outcome: "edit",
        edit_rationale: "Wrong extraction",
        replacement_item: commitment({ extraction_id: "extraction-2" }),
      } as Partial<ReviewDecision>),
    ],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (changedExtractionId.ok) {
    throw new Error("Expected extraction ID change to fail");
  }
  const changedKind = createContactShardCandidates({
    extraction: extraction(),
    decisions: [
      decision(
        {
          outcome: "edit",
          edit_rationale: "Wrong kind",
          replacement_item: {
            ...commitment(),
            kind: "preference",
            subject: "food",
            value: "cake",
          } as ExtractionItem,
        } as Partial<ReviewDecision>,
      ),
    ],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (changedKind.ok) throw new Error("Expected item kind change to fail");
  const droppedEvidence = createContactShardCandidates({
    extraction: extraction(),
    decisions: [
      decision(
        {
          outcome: "edit",
          edit_rationale: "No evidence",
          replacement_item: commitment({ evidence: [] }),
        } as Partial<ReviewDecision>,
      ),
    ],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (droppedEvidence.ok) throw new Error("Expected dropped evidence to fail");
  const swappedEvidence = createContactShardCandidates({
    extraction: extraction(),
    decisions: [
      decision({
        outcome: "edit",
        edit_rationale: "Wrong provenance",
        replacement_item: commitment({ evidence: [{ message_ids: ["m999"] }] }),
      } as Partial<ReviewDecision>),
    ],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (swappedEvidence.ok) throw new Error("Expected swapped evidence to fail");
});

Deno.test("direct raw-object construction cannot satisfy ContactShard candidate validation", () => {
  if (
    isContactShardCandidate({
      content: "raw",
      tags: ["contact"],
      source: "whatsapp_export",
    })
  ) {
    throw new Error("Expected raw object to fail shard-candidate validation");
  }
});

Deno.test("ContactShard candidates survive JSON round-trip and reject mutation", () => {
  const result = createContactShardCandidates({
    extraction: extraction(),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (!result.ok) throw new Error(result.message);
  const roundTripped = JSON.parse(JSON.stringify(result.value[0]));
  if (!validateContactShardCandidate(roundTripped).ok) {
    throw new Error("Expected serialized candidate to validate structurally");
  }
  roundTripped.tags = ["not valid"];
  if (isContactShardCandidate(roundTripped)) {
    throw new Error("Expected mutated candidate to fail structural guard");
  }
  const withExtraField = JSON.parse(JSON.stringify(result.value[0]));
  withExtraField.provider_payload = { raw: true };
  if (validateContactShardCandidate(withExtraField).ok) {
    throw new Error("Expected candidate with extra top-level field to fail");
  }
});

Deno.test("each supported extraction item kind validates with bounded evidence", () => {
  const variants: ExtractionItem[] = [
    commitment(),
    {
      ...baseItem("event-1"),
      kind: "event",
      title: "Dinner",
      starts_at: { value: "2026-07-01", precision: "date" },
    } as ExtractionItem,
    {
      ...baseItem("pref-1"),
      kind: "preference",
      subject: "coffee",
      value: "black",
    } as ExtractionItem,
    {
      ...baseItem("sentiment-1"),
      kind: "sentiment",
      sentiment: "positive",
      sensitivity: "inferred_sensitive",
      rationale: "Warm language",
    } as ExtractionItem,
    {
      ...baseItem("date-1"),
      kind: "important_date",
      label: "Birthday",
      date: { value: "07-12", precision: "month_day" },
    } as ExtractionItem,
    {
      ...baseItem("link-1"),
      kind: "shared_link",
      url: "https://example.com",
      title: "Example",
    } as ExtractionItem,
    {
      ...baseItem("theme-1"),
      kind: "conversation_theme",
      theme: "travel",
      summary: "Discussed summer travel",
    } as ExtractionItem,
  ];
  for (const item of variants) {
    const result = validateExtractionItem(item);
    if (!result.ok) {
      throw new Error(`Expected ${item.kind} to validate: ${result.message}`);
    }
  }
});

Deno.test("each supported item kind can produce one shard candidate", () => {
  const cases: Array<
    { item: ExtractionItem; expectedContent: string; expectedTag: string }
  > = [
    {
      item: commitment(),
      expectedContent: "Sarah committed to bring dessert.",
      expectedTag: "commitment",
    },
    {
      item: {
        ...baseItem("event-1"),
        kind: "event",
        title: "Dinner",
      } as ExtractionItem,
      expectedContent: "Dinner",
      expectedTag: "event",
    },
    {
      item: {
        ...baseItem("pref-1"),
        kind: "preference",
        subject: "coffee",
        value: "black",
      } as ExtractionItem,
      expectedContent: "coffee: black",
      expectedTag: "preference",
    },
    {
      item: {
        ...baseItem("sentiment-1"),
        kind: "sentiment",
        sentiment: "positive",
        sensitivity: "inferred_sensitive",
        rationale: "Warm language",
      } as ExtractionItem,
      expectedContent: "positive: Warm language",
      expectedTag: "sentiment",
    },
    {
      item: {
        ...baseItem("date-1"),
        kind: "important_date",
        label: "Birthday",
        date: { value: "07-12", precision: "month_day" },
      } as ExtractionItem,
      expectedContent: "Birthday: 07-12",
      expectedTag: "event",
    },
    {
      item: {
        ...baseItem("link-1"),
        kind: "shared_link",
        url: "https://example.com",
        title: "Example",
      } as ExtractionItem,
      expectedContent: "Example: https://example.com",
      expectedTag: "link",
    },
    {
      item: {
        ...baseItem("theme-1"),
        kind: "conversation_theme",
        theme: "travel",
        summary: "Discussed summer travel",
      } as ExtractionItem,
      expectedContent: "travel: Discussed summer travel",
      expectedTag: "theme",
    },
  ];
  for (const { item, expectedContent, expectedTag } of cases) {
    const result = createContactShardCandidates({
      extraction: extraction([item]),
      decisions: [decision({ item_id: item.item_id })],
      source: "whatsapp_export",
      agent_context: "contact-parser",
    });
    if (!result.ok) throw new Error(`${item.kind} failed: ${result.message}`);
    if (result.value.length !== 1) {
      throw new Error(`Expected one candidate for ${item.kind}`);
    }
    if (result.value[0].content !== expectedContent) {
      throw new Error(`Unexpected content for ${item.kind}`);
    }
    if (!result.value[0].tags.includes(expectedTag as never)) {
      throw new Error(`Missing ${expectedTag} tag for ${item.kind}`);
    }
  }
});

Deno.test("unknown item kind, duplicate item IDs, missing evidence, stale profile, and invalid sentiment fail", () => {
  if (validateExtractionItem({ ...commitment(), kind: "unknown" }).ok) {
    throw new Error("Expected unknown kind to fail");
  }
  if (validateContactExtraction(extraction([commitment(), commitment()])).ok) {
    throw new Error("Expected duplicate item IDs to fail");
  }
  if (validateExtractionItem({ ...commitment(), evidence: [] }).ok) {
    throw new Error("Expected missing evidence to fail");
  }
  if (validateExtractionItem({ ...commitment(), confidence: Number.NaN }).ok) {
    throw new Error("Expected NaN confidence to fail");
  }
  if (validateExtractionItem({ ...commitment(), confidence: Infinity }).ok) {
    throw new Error("Expected infinite confidence to fail");
  }
  if (validateExtractionItem({ ...commitment(), confidence: -0.1 }).ok) {
    throw new Error("Expected below-range confidence to fail");
  }
  if (validateExtractionItem({ ...commitment(), confidence: 1.1 }).ok) {
    throw new Error("Expected above-range confidence to fail");
  }
  if (validateExtractionItem({ ...commitment(), confidence: "0.9" }).ok) {
    throw new Error("Expected non-number confidence to fail");
  }
  if (
    validateExtractionItem({ ...commitment(), provider_payload: { raw: true } })
      .ok
  ) {
    throw new Error("Expected unexpected extraction item field to fail");
  }
  if (validateExtractionItem({ ...commitment(), profile: "personal" }).ok) {
    throw new Error("Expected stale profile field to fail");
  }
  if (
    validateExtractionItem({
      ...commitment(),
      kind: "sentiment",
      sentiment: "positive",
    }).ok
  ) throw new Error("Expected incomplete sentiment to fail");
});

Deno.test("decisions cannot attach to the wrong extraction", () => {
  const result = createContactShardCandidates({
    extraction: extraction(),
    decisions: [decision({ extraction_id: "other-extraction" })],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (result.ok) throw new Error("Expected cross-extraction decision to fail");
  const duplicateDecisionId = createContactShardCandidates({
    extraction: extraction([commitment(), commitment({ item_id: "item-2" })]),
    decisions: [
      decision(),
      decision({ decision_id: "decision-1", item_id: "item-2" }),
    ],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (duplicateDecisionId.ok) {
    throw new Error("Expected duplicate decision_id to fail");
  }
});

Deno.test("group-derived item cannot become a person-targeted shard until review supplies a person target", () => {
  const groupItem = commitment({
    target: { kind: "group", display_name: "Friends" },
  });
  const result = createContactShardCandidates({
    extraction: extraction([groupItem]),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (result.ok) {
    throw new Error(
      "Expected group-targeted item to fail shard candidate creation",
    );
  }
});

Deno.test("important date without a year uses month-day precision", () => {
  const result = validateExtractionItem({
    ...baseItem("date-1"),
    kind: "important_date",
    label: "Birthday",
    date: { value: "07-12", precision: "month_day" },
  });
  if (!result.ok) throw new Error(result.message);
});

Deno.test("event date range rejects an end before its start", () => {
  const result = validateExtractionItem({
    ...commitment(),
    kind: "event",
    title: "Dinner",
    starts_at: { value: "2026-07-02", precision: "date" },
    ends_at: { value: "2026-07-01", precision: "date" },
  });
  if (result.ok) throw new Error("Expected invalid date range to fail");
});

Deno.test("temporal fields reject malformed ContactDate shapes", () => {
  if (
    validateExtractionItem({
      ...commitment(),
      due: { value: "2026-07-01", precision: "bogus" },
    }).ok
  ) throw new Error("Expected invalid commitment due precision to fail");
  if (
    validateExtractionItem({
      ...commitment(),
      kind: "event",
      title: "Dinner",
      starts_at: { value: "2026-07-01" },
    }).ok
  ) throw new Error("Expected invalid event starts_at to fail");
  if (
    validateExtractionItem({
      ...commitment(),
      kind: "important_date",
      label: "Birthday",
      date: { value: "not-a-date", precision: "date" },
    }).ok
  ) throw new Error("Expected malformed date value to fail");
  if (
    validateExtractionItem({
      ...commitment(),
      kind: "important_date",
      label: "Birthday",
      date: { value: "2026-99-99", precision: "date" },
    }).ok
  ) throw new Error("Expected impossible calendar date to fail");
  if (
    validateExtractionItem({
      ...commitment(),
      kind: "important_date",
      label: "Birthday",
      date: { value: "99-99", precision: "month_day" },
    }).ok
  ) throw new Error("Expected impossible month-day date to fail");
  if (
    validateExtractionItem({
      ...commitment(),
      due: { value: "2026-07-01Tnot-a-timestamp", precision: "exact" },
    }).ok
  ) throw new Error("Expected malformed exact timestamp to fail");
  if (
    validateExtractionItem({
      ...commitment(),
      due: { value: "2026-07-01", precision: "date", raw: "hidden" },
    }).ok
  ) throw new Error("Expected ContactDate extra field to fail");
});

Deno.test("shared tag grammar validates Contact tags and rejects raw string[] use through shard path", () => {
  const tags = ensureValidatedTags([
    "contact",
    "contact:sarah",
    "commitment",
    "sentiment",
    "contact",
  ]);
  if (isTagValidationError(tags)) throw new Error(tags.message);
  if (
    JSON.stringify(tags) !==
      JSON.stringify(["contact", "contact:sarah", "commitment", "sentiment"])
  ) throw new Error(`Unexpected tags ${JSON.stringify(tags)}`);
  const contactTag = makeContactTag("Sarah Connor!");
  if (!contactTag.ok) throw new Error(contactTag.message);
  if (contactTag.value !== "contact:sarah-connor") {
    throw new Error(`Unexpected contact tag ${contactTag.value}`);
  }
  const delimiter = ensureValidatedTags(["contact;sarah"]);
  if (!isTagValidationError(delimiter)) {
    throw new Error("Expected array tag containing delimiter to fail");
  }
  const longContactTag = makeContactTag("A".repeat(80));
  if (longContactTag.ok) {
    throw new Error("Expected over-length contact tag to fail");
  }
});

Deno.test("Contact types import tag grammar from shared boundary", async () => {
  const source = await Deno.readTextFile(
    new URL("../../parser/types.ts", import.meta.url),
  );
  if (
    source.includes("../server/src/tagGrammar") ||
    source.includes("../../server/src/tagGrammar")
  ) {
    throw new Error(
      "Contact types must not import tag grammar from server/src",
    );
  }
  if (
    source.includes("TAG_PATTERN") || source.includes("MAX_TAGS") ||
    source.includes("MAX_TAG_LENGTH")
  ) {
    throw new Error("Contact types must not duplicate tag grammar constants");
  }
});

Deno.test("ContactShard rejects missing person contact tag and raw evidence payloads", () => {
  const missingContact = createContactShardCandidates({
    extraction: extraction([
      commitment({ target: { kind: "person", display_name: "!!!" } }),
    ]),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (missingContact.ok) {
    throw new Error("Expected invalid contact tag to fail");
  }
  const rawTranscript = createContactShardCandidates({
    extraction: extraction([
      commitment({
        evidence: [
          { message_ids: ["m1"], raw_transcript: "full chat" } as never,
        ],
      }),
    ]),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (rawTranscript.ok) {
    throw new Error("Expected raw transcript evidence to fail");
  }
  const longQuote = createContactShardCandidates({
    extraction: extraction([
      commitment({
        evidence: [{ message_ids: ["m1"], quote: "x".repeat(501) }],
      }),
    ]),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (longQuote.ok) {
    throw new Error("Expected oversized evidence quote to fail");
  }
  const malformedEvidence = createContactShardCandidates({
    extraction: extraction([
      commitment({ evidence: [{ message_ids: ["m1"], quote: 42 } as never] }),
    ]),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (malformedEvidence.ok) {
    throw new Error("Expected malformed optional evidence fields to fail");
  }
  const unknownEvidenceField = createContactShardCandidates({
    extraction: extraction([
      commitment({
        evidence: [
          { message_ids: ["m1"], provider_payload: { raw: true } } as never,
        ],
      }),
    ]),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (unknownEvidenceField.ok) {
    throw new Error("Expected unknown evidence field to fail");
  }
  const tooManyEvidenceEntries = createContactShardCandidates({
    extraction: extraction([
      commitment({
        evidence: Array.from(
          { length: 17 },
          (_, index) => ({ message_ids: [`m${index}`] }),
        ),
      }),
    ]),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (tooManyEvidenceEntries.ok) {
    throw new Error("Expected too many evidence entries to fail");
  }
  const tooManyMessageIds = createContactShardCandidates({
    extraction: extraction([
      commitment({
        evidence: [{
          message_ids: Array.from({ length: 33 }, (_, index) => `m${index}`),
        }],
      }),
    ]),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (tooManyMessageIds.ok) {
    throw new Error("Expected too many evidence message IDs to fail");
  }
  const overLengthMessageId = createContactShardCandidates({
    extraction: extraction([
      commitment({ evidence: [{ message_ids: ["m".repeat(129)] }] }),
    ]),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (overLengthMessageId.ok) {
    throw new Error("Expected over-length evidence message ID to fail");
  }
  const tooManySenderRefs = createContactShardCandidates({
    extraction: extraction([
      commitment({
        evidence: [{
          message_ids: ["m1"],
          sender_refs: Array.from(
            { length: 33 },
            (_, index) => `sender-${index}`,
          ),
        }],
      }),
    ]),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (tooManySenderRefs.ok) {
    throw new Error("Expected too many evidence sender refs to fail");
  }
  const invertedTimestampRange = createContactShardCandidates({
    extraction: extraction([
      commitment({
        evidence: [{
          message_ids: ["m1"],
          timestamp_range: { start: "2026-06-30", end: "2026-06-29" },
        }],
      }),
    ]),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (invertedTimestampRange.ok) {
    throw new Error("Expected inverted evidence timestamp_range to fail");
  }
  const timestampRangeExtraField = createContactShardCandidates({
    extraction: extraction([
      commitment({
        evidence: [
          {
            message_ids: ["m1"],
            timestamp_range: {
              start: "2026-06-29",
              end: "2026-06-30",
              raw: "hidden",
            },
          } as never,
        ],
      }),
    ]),
    decisions: [decision()],
    source: "whatsapp_export",
    agent_context: "contact-parser",
  });
  if (timestampRangeExtraField.ok) {
    throw new Error("Expected evidence timestamp_range extra field to fail");
  }
});

Deno.test("chat and source metadata shapes are validated", () => {
  if (
    validateExtractionItem({ ...commitment(), target: { kind: "chat" } }).ok
  ) {
    throw new Error("Expected chat target without session_id to fail");
  }
  if (
    validateContactExtraction({
      ...extraction(),
      source_chat: { session_id: "session-1", kind: "bogus" },
    }).ok
  ) throw new Error("Expected invalid source_chat kind to fail");
  if (
    validateWhatsAppChat({
      session_id: "session-1",
      kind: "group",
      participants: [123],
      messages: [],
    }).ok
  ) throw new Error("Expected invalid participants to fail");
  if (
    validateWhatsAppChat({
      session_id: "session-1",
      kind: "group",
      date_range: { start: "2026-01-01" },
      messages: [],
    }).ok
  ) throw new Error("Expected invalid date_range to fail");
});

Deno.test("optional target, item, and review fields preserve exported shapes", () => {
  if (
    validateExtractionItem({
      ...commitment(),
      target: { kind: "person", display_name: 123 },
    }).ok
  ) {
    throw new Error("Expected non-string person display_name to fail");
  }
  if (
    validateExtractionItem({
      ...commitment(),
      target: { kind: "group", group_id: 123 },
    }).ok
  ) {
    throw new Error("Expected non-string group_id to fail");
  }
  if (
    validateExtractionItem({
      ...commitment(),
      target: { kind: "chat", session_id: "session-1", contact_tag: 42 },
    }).ok
  ) throw new Error("Expected unsupported chat target fields to fail");
  if (
    validateExtractionItem({
      ...commitment(),
      target: { kind: "unknown", display_name: 123 },
    }).ok
  ) throw new Error("Expected unsupported unknown target fields to fail");
  if (validateExtractionItem({ ...commitment(), owner: 123 }).ok) {
    throw new Error("Expected non-string commitment owner to fail");
  }
  if (
    validateExtractionItem({
      ...commitment(),
      kind: "shared_link",
      url: "https://example.com",
      title: 123,
    }).ok
  ) throw new Error("Expected non-string shared link title to fail");
  if (
    validateReviewDecision({
      ...decision(),
      outcome: "reject",
      rejection_reason: 123,
    }).ok
  ) {
    throw new Error("Expected non-string rejection_reason to fail");
  }
  if (
    validateReviewDecision({
      ...decision(),
      replacement_item: commitment(),
      edit_rationale: 123,
    }).ok
  ) throw new Error("Expected approve decision with edit-only fields to fail");
  if (
    validateReviewDecision({
      ...decision({ outcome: "reject" } as Partial<ReviewDecision>),
      replacement_item: commitment(),
    }).ok
  ) throw new Error("Expected reject decision with edit-only fields to fail");
});

Deno.test("guards narrow extraction items, review decisions, and shard candidates", () => {
  if (!isExtractionItem(commitment())) {
    throw new Error("Expected item guard to pass");
  }
  if (!isReviewDecision(decision())) {
    throw new Error("Expected decision guard to pass");
  }
  const candidates = createContactShardCandidates({
    extraction: extraction(),
    decisions: [decision()],
    source: "manual",
    agent_context: "review",
  });
  if (!candidates.ok) throw new Error(candidates.message);
  if (!isContactShardCandidate(candidates.value[0])) {
    throw new Error("Expected shard candidate guard to pass");
  }
});

Deno.test("platform-coupled fields are not required or accepted as shard identity", () => {
  const result = createContactShardCandidates({
    extraction: extraction(),
    decisions: [decision()],
    source: "manual",
    agent_context: "review",
  });
  if (!result.ok) throw new Error(result.message);
  const candidate = result.value[0] as unknown as Record<
    string | symbol,
    unknown
  >;
  for (
    const forbidden of ["capture_thought", "memory_teach", "context", "profile"]
  ) {
    if (forbidden in candidate) {
      throw new Error(`Candidate should not expose ${forbidden}`);
    }
  }
  if (
    validateReviewDecision({ ...decision(), outcome: "capture_thought" }).ok
  ) throw new Error("Expected platform action outcome to fail");
});
