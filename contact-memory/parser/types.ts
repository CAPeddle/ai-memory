import {
  ensureValidatedTags,
  isTagValidationError,
  isValidatedTag,
  type ValidatedTag,
  validateTag,
} from "../../shared/tagGrammar.ts";

export type { ValidatedTag } from "../../shared/tagGrammar.ts";

const CONTACT_SHARD_CANDIDATE = Symbol("ContactShardCandidate");
const CONTACT_SHARD_CANDIDATE_KIND = "contact_shard_candidate";
const CONTACT_SHARD_SCHEMA_VERSION = 1;
const MAX_EVIDENCE_QUOTE_LENGTH = 500;
const MAX_EVIDENCE_REFS = 16;
const MAX_MESSAGE_IDS_PER_EVIDENCE = 32;
const MAX_REFS_PER_EVIDENCE = 32;
const MAX_EVIDENCE_REF_LENGTH = 128;
const REVIEW_BASE_KEYS = [
  "decision_id",
  "extraction_id",
  "item_id",
  "outcome",
  "reviewed_at",
  "reviewer_context",
];
const EXTRACTION_BASE_KEYS = [
  "item_id",
  "extraction_id",
  "kind",
  "confidence",
  "target",
  "evidence",
];

export type ContactSource = "whatsapp_export" | "manual" | "ai_session";
export type ChatKind = "one_to_one" | "group" | "unknown";
export type ExtractionItemKind =
  | "commitment"
  | "event"
  | "preference"
  | "sentiment"
  | "important_date"
  | "shared_link"
  | "conversation_theme";

export type ReviewOutcome = "approve" | "edit" | "reject";
export type DatePrecision =
  | "exact"
  | "date"
  | "month_day"
  | "ambiguous";

export interface ValidationError {
  ok: false;
  error: true;
  message: string;
  path?: string;
}

export type ValidationResult<T> = { ok: true; value: T } | ValidationError;

export interface WhatsAppMessage {
  message_id: string;
  timestamp: string;
  sender: string;
  body: string;
}

export interface WhatsAppChat {
  session_id: string;
  kind: ChatKind;
  messages: WhatsAppMessage[];
  participants?: string[];
  date_range?: {
    start: string;
    end: string;
  };
}

export interface EvidenceReference {
  message_ids: string[];
  timestamp_range?: {
    start: string;
    end: string;
  };
  sender_refs?: string[];
  contact_refs?: string[];
  quote?: string;
}

export type ExtractionTarget =
  | { kind: "person"; display_name?: string; contact_tag?: ValidatedTag }
  | { kind: "group"; display_name?: string; group_id?: string }
  | { kind: "chat"; session_id: string }
  | { kind: "unknown" };

interface ExtractionItemBase {
  item_id: string;
  extraction_id: string;
  kind: ExtractionItemKind;
  confidence: number;
  target: ExtractionTarget;
  evidence: EvidenceReference[];
}

export interface CommitmentItem extends ExtractionItemBase {
  kind: "commitment";
  summary: string;
  owner?: string;
  due?: ContactDate;
}

export interface EventItem extends ExtractionItemBase {
  kind: "event";
  title: string;
  starts_at?: ContactDate;
  ends_at?: ContactDate;
}

export interface PreferenceItem extends ExtractionItemBase {
  kind: "preference";
  subject: string;
  value: string;
}

export interface SentimentItem extends ExtractionItemBase {
  kind: "sentiment";
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  sensitivity: "inferred_sensitive";
  rationale: string;
}

export interface ImportantDateItem extends ExtractionItemBase {
  kind: "important_date";
  label: string;
  date: ContactDate;
}

export interface SharedLinkItem extends ExtractionItemBase {
  kind: "shared_link";
  url: string;
  title?: string;
}

export interface ConversationThemeItem extends ExtractionItemBase {
  kind: "conversation_theme";
  theme: string;
  summary: string;
}

export type ExtractionItem =
  | CommitmentItem
  | EventItem
  | PreferenceItem
  | SentimentItem
  | ImportantDateItem
  | SharedLinkItem
  | ConversationThemeItem;

export interface ContactDate {
  value: string;
  precision: DatePrecision;
}

export interface ContactExtraction {
  extraction_id: string;
  session_id: string;
  source_chat?: {
    session_id: string;
    kind: ChatKind;
  };
  items: ExtractionItem[];
}

interface ReviewDecisionBase {
  decision_id: string;
  extraction_id: string;
  item_id: string;
  outcome: ReviewOutcome;
  reviewed_at: string;
  reviewer_context: string;
}

export interface ApproveDecision extends ReviewDecisionBase {
  outcome: "approve";
}

export interface EditDecision extends ReviewDecisionBase {
  outcome: "edit";
  replacement_item: ExtractionItem;
  edit_rationale: string;
}

export interface RejectDecision extends ReviewDecisionBase {
  outcome: "reject";
  rejection_reason?: string;
}

export type ReviewDecision = ApproveDecision | EditDecision | RejectDecision;

export interface ContactShardEvidence {
  message_ids: string[];
  timestamp_range?: {
    start: string;
    end: string;
  };
  sender_refs?: string[];
  contact_refs?: string[];
  quote?: string;
}

export interface ContactShardTarget {
  kind: "person";
  display_name?: string;
  contact_tag: ValidatedTag;
}

export interface ContactShardCandidate {
  readonly [CONTACT_SHARD_CANDIDATE]?: true;
  contract_kind: typeof CONTACT_SHARD_CANDIDATE_KIND;
  schema_version: typeof CONTACT_SHARD_SCHEMA_VERSION;
  content: string;
  tags: ValidatedTag[];
  source: ContactSource;
  agent_context: string;
  session_id: string;
  extraction_id: string;
  item_id: string;
  item_kind: ExtractionItemKind;
  target: ContactShardTarget;
  review: {
    decision_id: string;
    outcome: "approve" | "edit";
    reviewed_at: string;
    reviewer_context: string;
    edit_rationale?: string;
  };
  evidence: ContactShardEvidence[];
}

export function validateWhatsAppChat(
  value: unknown,
): ValidationResult<WhatsAppChat> {
  if (!isRecord(value)) return fail("WhatsAppChat must be an object");
  if (!isNonEmptyString(value.session_id)) {
    return fail("WhatsAppChat.session_id is required", "session_id");
  }
  if (!isChatKind(value.kind)) {
    return fail("WhatsAppChat.kind is invalid", "kind");
  }
  if (!Array.isArray(value.messages)) {
    return fail("WhatsAppChat.messages must be an array", "messages");
  }
  if (
    value.participants !== undefined &&
    (!Array.isArray(value.participants) ||
      !value.participants.every(isNonEmptyString))
  ) {
    return fail(
      "WhatsAppChat.participants must be an array of strings",
      "participants",
    );
  }
  if (value.date_range !== undefined) {
    const dateRange = validateTimestampRange(value.date_range, "date_range");
    if (!dateRange.ok) return dateRange;
  }

  for (const [index, message] of value.messages.entries()) {
    if (!isRecord(message)) {
      return fail("WhatsAppMessage must be an object", `messages.${index}`);
    }
    for (
      const field of ["message_id", "timestamp", "sender", "body"] as const
    ) {
      const valid = field === "body"
        ? isString(message[field])
        : isNonEmptyString(message[field]);
      if (!valid) {
        return fail(
          `WhatsAppMessage.${field} is required`,
          `messages.${index}.${field}`,
        );
      }
    }
  }

  return { ok: true, value: value as unknown as WhatsAppChat };
}

export function validateContactExtraction(
  value: unknown,
): ValidationResult<ContactExtraction> {
  if (!isRecord(value)) return fail("ContactExtraction must be an object");
  if (
    hasAnyKey(value, [
      "content",
      "tags",
      "source",
      "agent_context",
      "profile",
      "capture_thought",
      "memory_teach",
      "context",
    ])
  ) {
    return fail(
      "ContactExtraction must remain review-only and cannot include shard fields",
    );
  }
  if (!isNonEmptyString(value.extraction_id)) {
    return fail("ContactExtraction.extraction_id is required", "extraction_id");
  }
  if (!isNonEmptyString(value.session_id)) {
    return fail("ContactExtraction.session_id is required", "session_id");
  }
  if (!Array.isArray(value.items)) {
    return fail("ContactExtraction.items must be an array", "items");
  }
  if (value.source_chat !== undefined) {
    const sourceChat = validateSourceChat(value.source_chat);
    if (!sourceChat.ok) return sourceChat;
  }

  const seenItems = new Set<string>();
  const items: ExtractionItem[] = [];
  for (const [index, item] of value.items.entries()) {
    const validated = validateExtractionItem(item);
    if (!validated.ok) {
      return { ...validated, path: validated.path ?? `items.${index}` };
    }
    if (validated.value.extraction_id !== value.extraction_id) {
      return fail(
        "Extraction item belongs to a different extraction",
        `items.${index}.extraction_id`,
      );
    }
    if (seenItems.has(validated.value.item_id)) {
      return fail("Duplicate item_id in extraction", `items.${index}.item_id`);
    }
    seenItems.add(validated.value.item_id);
    items.push(validated.value);
  }

  return {
    ok: true,
    value: { ...(value as object), items } as ContactExtraction,
  };
}

export function validateExtractionItem(
  value: unknown,
): ValidationResult<ExtractionItem> {
  if (!isRecord(value)) return fail("ExtractionItem must be an object");
  const baseError = validateExtractionItemBase(value);
  if (baseError) return baseError;

  switch (value.kind) {
    case "commitment":
      if (
        hasUnexpectedKeys(value, [
          ...EXTRACTION_BASE_KEYS,
          "summary",
          "owner",
          "due",
        ])
      ) {
        return fail("CommitmentItem contains unsupported fields");
      }
      if (value.due !== undefined) {
        const due = validateContactDate(value.due, "due");
        if (!due.ok) return due;
      }
      if (value.owner !== undefined && !isNonEmptyString(value.owner)) {
        return fail("CommitmentItem.owner must be a string", "owner");
      }
      return isNonEmptyString(value.summary)
        ? ok(value as unknown as CommitmentItem)
        : fail("CommitmentItem.summary is required", "summary");
    case "event":
      if (
        hasUnexpectedKeys(value, [
          ...EXTRACTION_BASE_KEYS,
          "title",
          "starts_at",
          "ends_at",
        ])
      ) {
        return fail("EventItem contains unsupported fields");
      }
      if (!isNonEmptyString(value.title)) {
        return fail("EventItem.title is required", "title");
      }
      if (value.starts_at !== undefined) {
        const startsAt = validateContactDate(value.starts_at, "starts_at");
        if (!startsAt.ok) return startsAt;
      }
      if (value.ends_at !== undefined) {
        const endsAt = validateContactDate(value.ends_at, "ends_at");
        if (!endsAt.ok) return endsAt;
      }
      if (
        isRecord(value.starts_at) && isRecord(value.ends_at) &&
        typeof value.starts_at.value === "string" &&
        typeof value.ends_at.value === "string" &&
        value.ends_at.value < value.starts_at.value
      ) {
        return fail("EventItem.ends_at cannot be before starts_at", "ends_at");
      }
      return ok(value as unknown as EventItem);
    case "preference":
      if (
        hasUnexpectedKeys(value, [...EXTRACTION_BASE_KEYS, "subject", "value"])
      ) {
        return fail("PreferenceItem contains unsupported fields");
      }
      return isNonEmptyString(value.subject) && isNonEmptyString(value.value)
        ? ok(value as unknown as PreferenceItem)
        : fail("PreferenceItem.subject and value are required");
    case "sentiment":
      if (
        hasUnexpectedKeys(value, [
          ...EXTRACTION_BASE_KEYS,
          "sentiment",
          "sensitivity",
          "rationale",
        ])
      ) {
        return fail("SentimentItem contains unsupported fields");
      }
      if (!isSentimentValue(value.sentiment)) {
        return fail("SentimentItem.sentiment is invalid", "sentiment");
      }
      if (value.sensitivity !== "inferred_sensitive") {
        return fail(
          "SentimentItem.sensitivity must mark inferred sensitive data",
          "sensitivity",
        );
      }
      if (!isNonEmptyString(value.rationale)) {
        return fail("SentimentItem.rationale is required", "rationale");
      }
      return ok(value as unknown as SentimentItem);
    case "important_date":
      if (
        hasUnexpectedKeys(value, [...EXTRACTION_BASE_KEYS, "label", "date"])
      ) {
        return fail("ImportantDateItem contains unsupported fields");
      }
      if (!isNonEmptyString(value.label)) {
        return fail("ImportantDateItem.label is required", "label");
      }
      return validateContactDate(value.date, "date").ok
        ? ok(value as unknown as ImportantDateItem)
        : fail("ImportantDateItem.date is invalid", "date");
    case "shared_link":
      if (hasUnexpectedKeys(value, [...EXTRACTION_BASE_KEYS, "url", "title"])) {
        return fail("SharedLinkItem contains unsupported fields");
      }
      if (value.title !== undefined && !isNonEmptyString(value.title)) {
        return fail("SharedLinkItem.title must be a string", "title");
      }
      return isNonEmptyString(value.url)
        ? ok(value as unknown as SharedLinkItem)
        : fail("SharedLinkItem.url is required", "url");
    case "conversation_theme":
      if (
        hasUnexpectedKeys(value, [...EXTRACTION_BASE_KEYS, "theme", "summary"])
      ) {
        return fail("ConversationThemeItem contains unsupported fields");
      }
      return isNonEmptyString(value.theme) && isNonEmptyString(value.summary)
        ? ok(value as unknown as ConversationThemeItem)
        : fail("ConversationThemeItem.theme and summary are required");
  }

  return fail("ExtractionItem.kind is invalid", "kind");
}

export function validateReviewDecision(
  value: unknown,
): ValidationResult<ReviewDecision> {
  if (!isRecord(value)) return fail("ReviewDecision must be an object");
  for (
    const field of [
      "decision_id",
      "extraction_id",
      "item_id",
      "reviewed_at",
      "reviewer_context",
    ] as const
  ) {
    if (!isNonEmptyString(value[field])) {
      return fail(`ReviewDecision.${field} is required`, field);
    }
  }
  if (value.outcome === "approve" || value.outcome === "reject") {
    const allowed = value.outcome === "approve"
      ? REVIEW_BASE_KEYS
      : [...REVIEW_BASE_KEYS, "rejection_reason"];
    if (hasUnexpectedKeys(value, allowed)) {
      return fail("ReviewDecision contains fields for another outcome");
    }
    if (
      value.outcome === "reject" && value.rejection_reason !== undefined &&
      !isNonEmptyString(value.rejection_reason)
    ) {
      return fail(
        "RejectDecision.rejection_reason must be a string",
        "rejection_reason",
      );
    }
    return ok(value as unknown as ReviewDecision);
  }
  if (value.outcome === "edit") {
    if (
      hasUnexpectedKeys(value, [
        ...REVIEW_BASE_KEYS,
        "replacement_item",
        "edit_rationale",
      ])
    ) {
      return fail("EditDecision contains fields for another outcome");
    }
    if (!isNonEmptyString(value.edit_rationale)) {
      return fail("EditDecision.edit_rationale is required", "edit_rationale");
    }
    const replacement = validateExtractionItem(value.replacement_item);
    if (!replacement.ok) return replacement;
    return ok(
      {
        ...(value as object),
        replacement_item: replacement.value,
      } as EditDecision,
    );
  }
  return fail("ReviewDecision.outcome is invalid", "outcome");
}

export function createContactShardCandidates(input: {
  extraction: ContactExtraction;
  decisions: ReviewDecision[];
  source: ContactSource;
  agent_context: string;
}): ValidationResult<ContactShardCandidate[]> {
  if (!isContactSource(input.source)) {
    return fail("Contact source is invalid", "source");
  }
  if (!isNonEmptyString(input.agent_context)) {
    return fail("agent_context is required", "agent_context");
  }

  const extraction = validateContactExtraction(input.extraction);
  if (!extraction.ok) return extraction;

  const itemsById = new Map(
    extraction.value.items.map((item) => [item.item_id, item]),
  );
  const seenDecisions = new Set<string>();
  const seenDecisionIds = new Set<string>();
  const candidates: ContactShardCandidate[] = [];

  for (const [index, rawDecision] of input.decisions.entries()) {
    const decision = validateReviewDecision(rawDecision);
    if (!decision.ok) {
      return { ...decision, path: decision.path ?? `decisions.${index}` };
    }
    if (decision.value.extraction_id !== extraction.value.extraction_id) {
      return fail(
        "Decision belongs to a different extraction",
        `decisions.${index}.extraction_id`,
      );
    }
    if (seenDecisions.has(decision.value.item_id)) {
      return fail(
        "Duplicate review decision for item",
        `decisions.${index}.item_id`,
      );
    }
    seenDecisions.add(decision.value.item_id);
    if (seenDecisionIds.has(decision.value.decision_id)) {
      return fail(
        "Duplicate review decision_id",
        `decisions.${index}.decision_id`,
      );
    }
    seenDecisionIds.add(decision.value.decision_id);

    const originalItem = itemsById.get(decision.value.item_id);
    if (!originalItem) {
      return fail(
        "Review decision references an unknown item_id",
        `decisions.${index}.item_id`,
      );
    }
    if (decision.value.outcome === "reject") continue;

    const item = decision.value.outcome === "edit"
      ? decision.value.replacement_item
      : originalItem;
    if (item.item_id !== originalItem.item_id) {
      return fail(
        "Edited item must preserve the original item_id",
        `decisions.${index}.replacement_item.item_id`,
      );
    }
    if (item.extraction_id !== originalItem.extraction_id) {
      return fail(
        "Edited item must preserve the original extraction_id",
        `decisions.${index}.replacement_item.extraction_id`,
      );
    }
    if (item.kind !== originalItem.kind) {
      return fail(
        "Edited item cannot change item kind",
        `decisions.${index}.replacement_item.kind`,
      );
    }
    if (!item.evidence.length) {
      return fail(
        "Edited item must preserve evidence",
        `decisions.${index}.replacement_item.evidence`,
      );
    }
    if (
      decision.value.outcome === "edit" &&
      !hasSameEvidence(item.evidence, originalItem.evidence)
    ) {
      return fail(
        "Edited item must preserve original evidence provenance",
        `decisions.${index}.replacement_item.evidence`,
      );
    }

    const candidate = buildContactShardCandidate(
      item,
      decision.value,
      input.source,
      input.agent_context,
      extraction.value.session_id,
    );
    if (!candidate.ok) return candidate;
    candidates.push(candidate.value);
  }

  return { ok: true, value: candidates };
}

export function isExtractionItem(value: unknown): value is ExtractionItem {
  return validateExtractionItem(value).ok;
}

export function isReviewDecision(value: unknown): value is ReviewDecision {
  return validateReviewDecision(value).ok;
}

export function isContactShardCandidate(
  value: unknown,
): value is ContactShardCandidate {
  return validateContactShardCandidate(value).ok;
}

export function validateContactShardCandidate(
  value: unknown,
): ValidationResult<ContactShardCandidate> {
  if (!isRecord(value)) return fail("ContactShardCandidate must be an object");
  if (
    hasUnexpectedKeys(value, [
      "contract_kind",
      "schema_version",
      "content",
      "tags",
      "source",
      "agent_context",
      "session_id",
      "extraction_id",
      "item_id",
      "item_kind",
      "target",
      "review",
      "evidence",
    ])
  ) return fail("ContactShardCandidate contains unsupported fields");
  if (
    hasAnyKey(value, ["capture_thought", "memory_teach", "context", "profile"])
  ) {
    return fail(
      "ContactShardCandidate must not include platform-coupled fields",
    );
  }
  if (value.contract_kind !== CONTACT_SHARD_CANDIDATE_KIND) {
    return fail(
      "ContactShardCandidate.contract_kind is invalid",
      "contract_kind",
    );
  }
  if (value.schema_version !== CONTACT_SHARD_SCHEMA_VERSION) {
    return fail(
      "ContactShardCandidate.schema_version is invalid",
      "schema_version",
    );
  }
  for (
    const field of [
      "content",
      "agent_context",
      "session_id",
      "extraction_id",
      "item_id",
    ] as const
  ) {
    if (!isNonEmptyString(value[field])) {
      return fail(`ContactShardCandidate.${field} is required`, field);
    }
  }
  if (!isContactSource(value.source)) {
    return fail("ContactShardCandidate.source is invalid", "source");
  }
  if (!isExtractionItemKind(value.item_kind)) {
    return fail("ContactShardCandidate.item_kind is invalid", "item_kind");
  }
  const tags = validateCandidateTags(value.tags);
  if (!tags.ok) return tags;
  const target = validateContactShardTarget(value.target);
  if (!target.ok) return target;
  const review = validateShardReview(value.review);
  if (!review.ok) return review;
  const evidence = validateEvidenceList(value.evidence);
  if (!evidence.ok) return evidence;
  return ok(
    {
      ...(value as object),
      tags: tags.value,
      target: target.value,
      review: review.value,
      evidence: evidence.value,
    } as ContactShardCandidate,
  );
}

export function makeContactTag(
  displayName: string,
): ValidationResult<ValidatedTag> {
  const result = contactTagFromDisplayName(displayName);
  return isTagValidationError(result) ? fail(result.message) : ok(result);
}

function contactTagFromDisplayName(
  displayName: string,
): ValidatedTag | ReturnType<typeof validateTag> {
  const slug = displayName
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  return validateTag(`contact:${slug}`, `contact:${slug}`);
}

function validateCandidateTags(
  value: unknown,
): ValidationResult<ValidatedTag[]> {
  if (!Array.isArray(value)) {
    return fail("ContactShardCandidate.tags must be an array", "tags");
  }
  if (!value.every((tag) => typeof tag === "string" && isValidatedTag(tag))) {
    return fail(
      "ContactShardCandidate.tags must contain only valid tags",
      "tags",
    );
  }
  const tags = ensureValidatedTags(value);
  if (isTagValidationError(tags)) return fail(tags.message, "tags");
  if (
    !tags.includes("contact" as ValidatedTag) ||
    !tags.some((tag) => tag.startsWith("contact:"))
  ) {
    return fail(
      "ContactShardCandidate.tags must include contact and contact:* tags",
      "tags",
    );
  }
  return ok(tags);
}

function validateContactShardTarget(
  value: unknown,
): ValidationResult<ContactShardTarget> {
  const target = validateTarget(value);
  if (!target.ok) return target;
  if (target.value.kind !== "person" || !target.value.contact_tag) {
    return fail(
      "ContactShardCandidate.target must be person-targeted with contact_tag",
      "target",
    );
  }
  return ok(target.value as ContactShardTarget);
}

function validateShardReview(
  value: unknown,
): ValidationResult<ContactShardCandidate["review"]> {
  if (!isRecord(value)) {
    return fail("ContactShardCandidate.review must be an object", "review");
  }
  const allowed = value.outcome === "edit"
    ? [
      "decision_id",
      "outcome",
      "reviewed_at",
      "reviewer_context",
      "edit_rationale",
    ]
    : ["decision_id", "outcome", "reviewed_at", "reviewer_context"];
  if (hasUnexpectedKeys(value, allowed)) {
    return fail(
      "ContactShardCandidate.review contains unsupported fields",
      "review",
    );
  }
  for (
    const field of ["decision_id", "reviewed_at", "reviewer_context"] as const
  ) {
    if (!isNonEmptyString(value[field])) {
      return fail(
        `ContactShardCandidate.review.${field} is required`,
        `review.${field}`,
      );
    }
  }
  if (value.outcome !== "approve" && value.outcome !== "edit") {
    return fail(
      "ContactShardCandidate.review.outcome is invalid",
      "review.outcome",
    );
  }
  if (value.outcome === "edit" && !isNonEmptyString(value.edit_rationale)) {
    return fail(
      "ContactShardCandidate.review.edit_rationale is required",
      "review.edit_rationale",
    );
  }
  return ok(value as ContactShardCandidate["review"]);
}

function buildContactShardCandidate(
  item: ExtractionItem,
  decision: ApproveDecision | EditDecision,
  source: ContactSource,
  agentContext: string,
  sessionId: string,
): ValidationResult<ContactShardCandidate> {
  if (item.target.kind !== "person") {
    return fail(
      "Only person-targeted reviewed items can become ContactShard candidates",
      "target",
    );
  }
  const contactTag = item.target.contact_tag ??
    (item.target.display_name
      ? contactTagFromDisplayName(item.target.display_name)
      : undefined);
  if (!contactTag || isTagValidationError(contactTag)) {
    return fail(
      "Person-targeted shard requires a valid contact:* tag",
      "target.contact_tag",
    );
  }

  const kindTag = validateTag(tagForItemKind(item.kind));
  if (isTagValidationError(kindTag)) return fail(kindTag.message);
  const tags = ensureValidatedTags(["contact", contactTag, kindTag]);
  if (isTagValidationError(tags)) return fail(tags.message);

  const evidence = item.evidence.map((entry) => ({ ...entry }));
  const candidate: ContactShardCandidate = {
    [CONTACT_SHARD_CANDIDATE]: true,
    contract_kind: CONTACT_SHARD_CANDIDATE_KIND,
    schema_version: CONTACT_SHARD_SCHEMA_VERSION,
    content: renderShardContent(item),
    tags,
    source,
    agent_context: agentContext,
    session_id: sessionId,
    extraction_id: item.extraction_id,
    item_id: item.item_id,
    item_kind: item.kind,
    target: { ...item.target, contact_tag: contactTag },
    review: {
      decision_id: decision.decision_id,
      outcome: decision.outcome,
      reviewed_at: decision.reviewed_at,
      reviewer_context: decision.reviewer_context,
      ...(decision.outcome === "edit"
        ? { edit_rationale: decision.edit_rationale }
        : {}),
    },
    evidence,
  };

  return ok(candidate);
}

function validateExtractionItemBase(
  value: Record<string, unknown>,
): ValidationError | null {
  if (
    hasAnyKey(value, ["profile", "capture_thought", "memory_teach", "context"])
  ) return fail("ExtractionItem must not include platform-coupled fields");
  if (!isNonEmptyString(value.item_id)) {
    return fail("ExtractionItem.item_id is required", "item_id");
  }
  if (!isNonEmptyString(value.extraction_id)) {
    return fail("ExtractionItem.extraction_id is required", "extraction_id");
  }
  if (!isExtractionItemKind(value.kind)) {
    return fail("ExtractionItem.kind is invalid", "kind");
  }
  if (
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) || value.confidence < 0 ||
    value.confidence > 1
  ) {
    return fail(
      "ExtractionItem.confidence must be between 0 and 1",
      "confidence",
    );
  }
  const target = validateTarget(value.target);
  if (!target.ok) return target;
  const evidence = validateEvidenceList(value.evidence);
  if (!evidence.ok) return evidence;
  return null;
}

function validateTarget(value: unknown): ValidationResult<ExtractionTarget> {
  if (!isRecord(value)) {
    return fail("ExtractionItem.target must be an object", "target");
  }
  if (value.kind === "person") {
    if (hasUnexpectedKeys(value, ["kind", "display_name", "contact_tag"])) {
      return fail("Person target contains unsupported fields", "target");
    }
    if (
      value.display_name !== undefined && !isNonEmptyString(value.display_name)
    ) {
      return fail(
        "Person target display_name must be a string",
        "target.display_name",
      );
    }
    if (
      value.contact_tag !== undefined &&
      (typeof value.contact_tag !== "string" ||
        !isValidatedTag(value.contact_tag) ||
        !value.contact_tag.startsWith("contact:"))
    ) {
      return fail(
        "Person target contact_tag must be a valid contact:* tag",
        "target.contact_tag",
      );
    }
    return ok(value as ExtractionTarget);
  }
  if (value.kind === "group") {
    if (hasUnexpectedKeys(value, ["kind", "display_name", "group_id"])) {
      return fail("Group target contains unsupported fields", "target");
    }
    if (
      value.display_name !== undefined && !isNonEmptyString(value.display_name)
    ) {
      return fail(
        "Group target display_name must be a string",
        "target.display_name",
      );
    }
    if (value.group_id !== undefined && !isNonEmptyString(value.group_id)) {
      return fail("Group target group_id must be a string", "target.group_id");
    }
    return ok(value as ExtractionTarget);
  }
  if (value.kind === "chat") {
    if (hasUnexpectedKeys(value, ["kind", "session_id"])) {
      return fail("Chat target contains unsupported fields", "target");
    }
    return isNonEmptyString(value.session_id)
      ? ok(value as ExtractionTarget)
      : fail("Chat target requires session_id", "target.session_id");
  }
  if (value.kind === "unknown") {
    return hasUnexpectedKeys(value, ["kind"])
      ? fail("Unknown target contains unsupported fields", "target")
      : ok(value as ExtractionTarget);
  }
  return fail("ExtractionItem.target.kind is invalid", "target.kind");
}

function validateEvidenceList(
  value: unknown,
): ValidationResult<EvidenceReference[]> {
  if (!Array.isArray(value)) {
    return fail("ExtractionItem.evidence must be an array", "evidence");
  }
  if (value.length === 0) {
    return fail("ExtractionItem.evidence is required", "evidence");
  }
  if (value.length > MAX_EVIDENCE_REFS) {
    return fail("ExtractionItem.evidence has too many entries", "evidence");
  }
  for (const [index, entry] of value.entries()) {
    const result = validateEvidence(entry, `evidence.${index}`);
    if (!result.ok) return result;
  }
  return ok(value as EvidenceReference[]);
}

function validateEvidence(
  value: unknown,
  path: string,
): ValidationResult<EvidenceReference> {
  if (!isRecord(value)) {
    return fail("EvidenceReference must be an object", path);
  }
  if (
    hasUnexpectedKeys(value, [
      "message_ids",
      "timestamp_range",
      "sender_refs",
      "contact_refs",
      "quote",
    ])
  ) return fail("EvidenceReference contains unsupported fields", path);
  if (
    hasAnyKey(value, [
      "chat",
      "messages",
      "raw_transcript",
      "rawTranscript",
      "body",
    ])
  ) {
    return fail(
      "EvidenceReference must not include raw chats, transcripts, or message bodies",
      path,
    );
  }
  if (
    !Array.isArray(value.message_ids) || value.message_ids.length === 0 ||
    value.message_ids.length > MAX_MESSAGE_IDS_PER_EVIDENCE ||
    !value.message_ids.every((id) => isBoundedRef(id))
  ) {
    return fail(
      "EvidenceReference.message_ids must contain bounded non-empty IDs",
      `${path}.message_ids`,
    );
  }
  if (value.timestamp_range !== undefined) {
    const timestampRange = validateTimestampRange(
      value.timestamp_range,
      `${path}.timestamp_range`,
    );
    if (!timestampRange.ok) return timestampRange;
  }
  for (const field of ["sender_refs", "contact_refs"] as const) {
    if (
      value[field] !== undefined &&
      (!Array.isArray(value[field]) ||
        value[field].length > MAX_REFS_PER_EVIDENCE ||
        !value[field].every((ref) => isBoundedRef(ref)))
    ) {
      return fail(
        `EvidenceReference.${field} must be an array of bounded strings`,
        `${path}.${field}`,
      );
    }
  }
  if (value.quote !== undefined && typeof value.quote !== "string") {
    return fail("EvidenceReference.quote must be a string", `${path}.quote`);
  }
  if (
    typeof value.quote === "string" &&
    value.quote.length > MAX_EVIDENCE_QUOTE_LENGTH
  ) {
    return fail(
      "EvidenceReference.quote exceeds bounded quote length",
      `${path}.quote`,
    );
  }
  return ok(value as unknown as EvidenceReference);
}

function validateSourceChat(
  value: unknown,
): ValidationResult<ContactExtraction["source_chat"]> {
  if (!isRecord(value)) {
    return fail(
      "ContactExtraction.source_chat must be an object",
      "source_chat",
    );
  }
  if (!isNonEmptyString(value.session_id)) {
    return fail(
      "ContactExtraction.source_chat.session_id is required",
      "source_chat.session_id",
    );
  }
  if (!isChatKind(value.kind)) {
    return fail(
      "ContactExtraction.source_chat.kind is invalid",
      "source_chat.kind",
    );
  }
  return ok(value as ContactExtraction["source_chat"]);
}

function validateTimestampRange(
  value: unknown,
  path: string,
): ValidationResult<{ start: string; end: string }> {
  if (!isRecord(value)) return fail("Timestamp range must be an object", path);
  if (hasUnexpectedKeys(value, ["start", "end"])) {
    return fail("Timestamp range contains unsupported fields", path);
  }
  if (!isNonEmptyString(value.start)) {
    return fail("Timestamp range start is required", `${path}.start`);
  }
  if (!isNonEmptyString(value.end)) {
    return fail("Timestamp range end is required", `${path}.end`);
  }
  if (
    !isComparableTimestamp(value.start) || !isComparableTimestamp(value.end)
  ) {
    return fail(
      "Timestamp range values must be ISO-like dates or timestamps",
      path,
    );
  }
  if (Date.parse(value.end) < Date.parse(value.start)) {
    return fail("Timestamp range end cannot be before start", `${path}.end`);
  }
  return ok(value as { start: string; end: string });
}

function hasSameEvidence(
  actual: readonly EvidenceReference[],
  expected: readonly EvidenceReference[],
): boolean {
  if (actual.length !== expected.length) return false;
  return actual.every((ref, index) =>
    canonicalizeEvidenceReference(ref) ===
      canonicalizeEvidenceReference(expected[index])
  );
}

function canonicalizeEvidenceReference(ref: EvidenceReference): string {
  return JSON.stringify({
    message_ids: [...ref.message_ids].sort(),
    timestamp_range: ref.timestamp_range ?? null,
    sender_refs: [...(ref.sender_refs ?? [])].sort(),
    contact_refs: [...(ref.contact_refs ?? [])].sort(),
    quote: ref.quote ?? null,
  });
}

function isBoundedRef(value: unknown): value is string {
  return isNonEmptyString(value) && value.length <= MAX_EVIDENCE_REF_LENGTH;
}

function isComparableTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(value)) return false;
  const [datePart] = value.split("T", 1);
  if (!isValidDate(datePart)) return false;
  return !value.includes("T") || !Number.isNaN(Date.parse(value));
}

function validateContactDate(
  value: unknown,
  path: string,
): ValidationResult<ContactDate> {
  if (!isRecord(value)) return fail("ContactDate must be an object", path);
  if (hasUnexpectedKeys(value, ["value", "precision"])) {
    return fail("ContactDate contains unsupported fields", path);
  }
  if (!isNonEmptyString(value.value)) {
    return fail("ContactDate.value is required", `${path}.value`);
  }
  if (!isDatePrecision(value.precision)) {
    return fail("ContactDate.precision is invalid", `${path}.precision`);
  }
  if (!isContactDateValue(value.value, value.precision)) {
    return fail("ContactDate.value does not match precision", `${path}.value`);
  }
  return ok(value as unknown as ContactDate);
}

function isContactDateValue(value: string, precision: DatePrecision): boolean {
  if (precision === "month_day") return isValidMonthDay(value);
  if (precision === "date") {
    return isValidDate(value);
  }
  if (precision === "exact") {
    const [datePart] = value.split("T", 1);
    if (!isValidDate(datePart)) return false;
    return !value.includes("T") || !Number.isNaN(Date.parse(value));
  }
  return value.trim().length > 0;
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function isValidMonthDay(value: string): boolean {
  const match = /^(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const date = new Date(Date.UTC(2000, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function renderShardContent(item: ExtractionItem): string {
  switch (item.kind) {
    case "commitment":
      return item.summary;
    case "event":
      return item.title;
    case "preference":
      return `${item.subject}: ${item.value}`;
    case "sentiment":
      return `${item.sentiment}: ${item.rationale}`;
    case "important_date":
      return `${item.label}: ${item.date.value}`;
    case "shared_link":
      return item.title ? `${item.title}: ${item.url}` : item.url;
    case "conversation_theme":
      return `${item.theme}: ${item.summary}`;
  }
}

function tagForItemKind(kind: ExtractionItemKind): string {
  if (kind === "shared_link") return "link";
  if (kind === "important_date") return "event";
  if (kind === "conversation_theme") return "theme";
  return kind;
}

function isExtractionItemKind(value: unknown): value is ExtractionItemKind {
  return typeof value === "string" &&
    [
      "commitment",
      "event",
      "preference",
      "sentiment",
      "important_date",
      "shared_link",
      "conversation_theme",
    ].includes(value);
}

function isChatKind(value: unknown): value is ChatKind {
  return value === "one_to_one" || value === "group" || value === "unknown";
}

function isDatePrecision(value: unknown): value is DatePrecision {
  return typeof value === "string" &&
    ["exact", "date", "month_day", "ambiguous"].includes(value);
}

function isSentimentValue(value: unknown): value is SentimentItem["sentiment"] {
  return value === "positive" || value === "neutral" || value === "negative" ||
    value === "mixed";
}

function isContactSource(value: unknown): value is ContactSource {
  return value === "whatsapp_export" || value === "manual" ||
    value === "ai_session";
}

function hasAnyKey(
  value: Record<string | symbol, unknown>,
  keys: string[],
): boolean {
  return keys.some((key) => key in value);
}

function hasUnexpectedKeys(
  value: Record<string | symbol, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set<string>(allowedKeys);
  return Object.keys(value).some((key) => !allowed.has(key));
}

function isRecord(value: unknown): value is Record<string | symbol, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function fail(message: string, path?: string): ValidationError {
  return { ok: false, error: true, message, ...(path ? { path } : {}) };
}
