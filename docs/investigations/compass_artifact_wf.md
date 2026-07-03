# Building a Medium-Agnostic Contact Memory Extraction Layer: WhatsApp, Email, and Meeting Transcripts

## TL;DR
- **Draw the abstraction boundary at a normalized message/turn schema**: keep everything medium-specific (WhatsApp `DD/MM/YYYY, HH:MM - Name:` parsing, Gmail/Graph MIME handling, VTT/transcript speaker labels) in per-medium adapters that emit a common `NormalizedConversation` (a wrapper whose `turns` are `NormalizedTurn` records `{source_id, speaker, text, timestamp, thread_id, medium}`), then run ONE shared, schema-constrained LLM extraction stage that outputs your existing `ContactExtraction` discriminated union. This is the pattern used by the most credible open-source system in this space (Garry Tan's GBrain): "code for data, LLMs for judgment."
- **The single highest-leverage reliability technique is source grounding**: force every extracted item to carry a verbatim quote span plus the `source_id`(s) of the message/turn it came from, resolve pronouns/coreference and relative dates into absolute values at extraction time, and drop or flag items whose quote can't be matched back to the source. Combine with self-reported confidence as a coarse first-pass filter (discard below ~0.4) and route mid-confidence items to human review — general LLM extraction agrees with human coding only ~62–72% of the time, so a human-in-the-loop gate is not optional for a personal knowledge base.
- **Handle "which fact wins" deterministically, not with the LLM**: store facts append-only with `valid_at`/`recorded_at` bitemporal timestamps and a `supersedes` chain; resolve current-value conflicts (contact's job, city, relationship status) with a deterministic recency/version comparison in code rather than asking the LLM to reason about freshness — recent benchmark work shows deterministic aggregation beats every major memory framework on conflict resolution by 50–87 percentage points.

## Key Findings

### 1. The right architecture: two-layer split (medium-specific parse → medium-agnostic extract)
The cleanest and most battle-tested pattern is a strict separation between a **deterministic parsing/normalization layer** (per medium) and a **medium-agnostic semantic extraction layer** (shared). GBrain, the open-source personal-knowledge system built by Y Combinator CEO Garry Tan (open-sourced ~April 2026; his production instance holds 146,646 pages, 24,585 people, and 5,339 companies), states its design philosophy verbatim as **"The core pattern: code for data, LLMs for judgment. The [collector] is deterministic code... It NEVER interprets content. YOU (the agent) read the collected data and make judgment calls: who is important, what entities are mentioned, what narratives are forming."** A deterministic Node layer pulls/cleans messages and generates provenance links; the LLM layer only decides who is important and what entities/facts/action-items exist. Notably, GBrain extracts **typed graph edges (attended, works_at, invested_in, founded, advises, mentions) with zero LLM calls** — relationship structure is derived deterministically, and the LLM is reserved for genuinely semantic judgment. **(Verified 2026-07-03 against [garrytan/gbrain](https://github.com/garrytan/gbrain).)** The zero-LLM mechanism is *pattern matching on wikilink / typed-link syntax already present in the page markdown* (`[[wiki/people/bob]]`-style refs) — auto-link fires on every `put_page` and wires edges from refs the content already contains. It does **not** infer relationships from free-form prose. Implication for this pipeline: typed edges are only "free" once an upstream step has emitted structured pages carrying those refs; for raw WhatsApp/email/transcript text, the LLM extraction stage must first produce the entities + typed references, after which deterministic graph-wiring applies. Treat "zero LLM calls" as describing the *graph-wiring* step, not relationship extraction from conversation.

Your existing setup already matches this: the WhatsApp parser (pure TS/Deno) is the medium-specific layer; `ContactExtraction` is the medium-agnostic contract. The design recommendation is to formalize a **`NormalizedConversation`** intermediate representation that every medium adapter emits, so the extraction stage never sees raw medium formats.

**Recommended normalized turn schema** (converging on what agent-memory research papers use):
```
NormalizedTurn = {
  source_id: string        // stable per-message id (WA line index, Gmail message id, transcript cue #)
  medium: 'whatsapp' | 'email' | 'transcript' | ...
  speaker: { display_name, contact_id?, is_self: boolean }
  text: string
  timestamp: string        // ISO; session/thread boundaries preserved
  thread_id?: string
  meta?: {...}             // medium-specific extras (attachment refs, diarization confidence)
}
```
The actual unit every medium adapter emits — and the extractor consumes — is a **`NormalizedConversation`** that wraps the turns for a single conversation/thread:
```
NormalizedConversation = {
  conversation_id: string
  medium: 'whatsapp' | 'email' | 'transcript' | ...
  participants: { display_name, contact_id?, is_self: boolean }[]
  turns: NormalizedTurn[]
  meta?: {...}             // thread/session boundaries, source-file refs
}
```
Wherever this document says an adapter emits `NormalizedTurn[]`, read it as emitting a `NormalizedConversation` whose `.turns` is that array — `NormalizedTurn[]` is the payload, `NormalizedConversation` is the transport. This mirrors the dialogue-turn tuples used across the memory literature (e.g. `(id, speaker, text, τ, session_start, session_end)` in RaMem, arXiv:2606.22844), which use the session/thread span as the stable "episodic coordinate" for later retrieval.

### 2. LLM structured extraction best practices (cross-cutting)

**Schema-constrained / structured outputs.** For TypeScript/Deno, the consensus stack is **Zod schemas + `.describe()` annotations passed as JSON Schema to the model** (via native structured-output/tool-calling with `strict: true` on OpenAI/Anthropic), optionally wrapped by **Instructor-JS** (Zod-based, adds retries-with-validation-feedback and partial streaming). Zod's discriminated-union support (`z.discriminatedUnion`) maps directly onto your seven-kind `ContactExtraction` union. For a cross-language schema contract or resilient parsing of malformed model output, **BAML** is the notable alternative — its Schema-Aligned Parsing (SAP) extracts intended data from imperfect JSON without retries, and it explicitly supports discriminated unions at compile time plus `@@dynamic`/TypeBuilder for runtime-defined schemas. **Verdict for your stack: Zod + native structured outputs is the path of least resistance; adopt Instructor-JS for retry/streaming ergonomics; consider BAML only if you later need cross-language contracts.**

**Schema design rules that measurably affect accuracy** (practitioner consensus):
- Put "reasoning"/evidence fields *before* answer fields (models generate left-to-right, so field order = prompt order).
- Make fields that may be absent **optional** — forcing a required field when the data doesn't exist induces hallucination.
- **One schema per task**; don't extract 50 fields in one mega-call. For your union, this argues for either per-kind extraction passes or a two-stage "identify spans → classify into kind" flow.
- **Ask for verbatim evidence spans** — "it's hard to hallucinate a quote you have to pull verbatim."

**Source grounding is the anti-hallucination workhorse.** Google's open-source **LangExtract** (released July 30, 2025, Apache 2.0) is the reference implementation of the pattern you want: per Google's Developers Blog, **"Every extracted entity is mapped back to its exact character offsets in the source text... LangExtract uses... Controlled Generation in supported models like Gemini to ensure consistently structured outputs."** It uses **few-shot examples with verbatim (non-paraphrased) extraction text** (it raises "prompt alignment warnings" if your examples paraphrase) and does **multi-pass extraction for higher recall** plus chunking/parallelization for long inputs. Although it's Python, the design is directly portable: your extraction items should each carry `{quote: string, source_ids: string[], char_span?: [start,end]}`, and you should validate that the quote actually appears in the cited source before persisting.

**Confidence scoring & human-in-the-loop.**
- **Self-reported confidence** is usable only as a coarse first-pass filter. "Re-Centering Humans in LLM Personalization" (arXiv:2606.06614) discards attributes below **0.4 confidence**, stating explicitly: *"These confidence values are self-reported by the extraction model and serve only as a coarse first-pass filter."* (It uses Llama-3.3-70B at temp 0.8; its dedup uses a cosine-0.7 threshold — see below.)
- **Token logprobs/perplexity** are an alternative but (a) fail to detect "unknown unknowns" and (b) aren't exposed by Anthropic — so don't depend on them.
- **Self-consistency / consensus voting** (run extraction k times, keep items that recur; low-recurrence = likely hallucination → auto-filter; middling = human review; high = auto-accept) is the more robust confidence signal. **Open design point (resolved 2026-07-03, ST-073):** "items that recur" presumes a *fact-equality* function that this technique does not itself define — deciding two independently-extracted items are "the same" is the very fuzzy-matching problem the pipeline is trying to avoid. **Recommended approach: structured-key blocking → embedding-cosine within block.** Block candidates by `kind + target.contact_id` (deterministic, cheap), then treat two items in a block as recurring when their embeddings exceed a cosine threshold (reuse the ~0.7 dedup threshold below and the pgvector embeddings already stored), with exact-string match as a fast pre-check and an optional LLM-judge tiebreak reserved only for ambiguous mid-band pairs. This keeps the LLM out of the matching loop (honoring "code for data, LLMs for judgment"). Avoid embedding-only matching across *all* items (false merges across kinds) and avoid an LLM-judge over every k-choose-2 pair (cost + reintroduces the LLM into a step meant to be deterministic).
- **Tiered routing** is the standard production pattern: auto-accept high confidence, queue mid-confidence (entailment ~0.4–0.6) for review, auto-drop low. General LLM extraction agrees with human coding only **71.17% (Gemini 1.5 Flash), 72.14% (Gemini 1.5 Pro), and 62.43% (Mistral Large 2)** of the time (Schroeder et al., arXiv:2501.11840, systematic-review data extraction — figures verified 2026-07-03; the citation's earlier "Konet et al." attribution was **corrected to Noah L. Schroeder et al.**), which is why every serious extraction system in regulated domains keeps a human gate.
- Given the manual-facts input path you already have, the natural UX is to surface extracted items as **suggested facts pending user confirmation**, converting the human-in-the-loop requirement into a product feature rather than overhead.

**Conflict resolution & memory hygiene.** This is where naive systems rot.
- Agent-memory frameworks (Mem0, Zep/Graphiti) implement an **extract → then update/reconcile** two-phase pipeline; the update phase does conflict detection (contradictory facts), dedup, and supersession. Zep's Graphiti uses **bitemporal edges**: every fact carries both event time (when true) and ingestion time (when observed), so superseded facts are preserved-but-flagged, not deleted.
- **But don't delegate freshness reasoning to the LLM.** "Don't Ask the LLM to Track Freshness: A Deterministic Recipe for Memory Conflict Resolution" (arXiv:2606.01435) shows a deterministic candidate-extraction + `max(timestamp)` resolver beats every published memory framework on MemoryAgentBench FactConsolidation **by 50–87 percentage points** — with industry frameworks scoring Mem0 18.0%, Graphiti/Zep 7.0%, MemGPT/Letta 28.0%, MIRIX 14.0%, Cognee 28.0%, and even the strongest RAG system (HippoRAG-v2) reaching only 54.0% single-hop — and it improves +10.8pp over an LLM-judgment answer pipeline in matched setups. **Design lesson: narrow the LLM to semantic identification + candidate extraction, and delegate comparisons over timestamps/versions to plain code.**
- Practical hygiene requirements: TTL/decay policies, dedup (embed extracted facts, agglomerative-cluster, keep the representative nearest the confidence-weighted centroid — the personalization paper above used cosine threshold **0.7**), and explicit supersedes chains. On Postgres/pgvector this is native: store facts as rows with `valid_at`, `recorded_at`, `superseded_by`, an embedding column for dedup, and provenance `source_ids`.

### 3. WhatsApp (chat) extraction layer

The raw parser exists; the AI layer needs:

**Chunking.** Chat histories are long and low-density. The strongest pattern from memory research is **coarse-grained, narrative fact extraction**: rather than one fact per message, extract 2–5 self-contained narrative facts per *conversation/exchange*, each preserving cross-turn context, participants, and reasoning (**"Hindsight is 20/20,"** arXiv:2512.12818 — the system is named **Hindsight**, not "TEMPR" as an earlier draft labeled it; corrected 2026-07-03 — which stores "a single narrative fact that makes downstream retrieval and reasoning less sensitive to local segmentation decisions"). Use **overlapping sliding windows** (window size W, overlap O; windows advance W−O turns) so facts near a chunk boundary aren't lost, and cap facts-per-window to avoid over-fragmentation. Segment by **conversation** using a time-gap heuristic (a common WhatsApp approach groups messages within ~1 hour into a "conversation").

**Coreference & temporal grounding — do it inside the extraction prompt.** The dominant prompt pattern across memory papers (D-Mem, SEEM, ENGRAM, LightMem) is explicit and worth copying nearly verbatim:
- **Resolve pronouns to named entities**: as one prompt puts it, "If the input says 'Melanie: I like art', the fact MUST be 'Melanie likes art', NOT 'the user likes art'." Every fact must be a standalone, de-contextualized statement naming the people involved.
- **Include timestamp + speaker for every fact.**
- **Normalize relative time** ("last week," "in March," "yesterday") to absolute dates using the message timestamp as anchor, and distinguish **event time from mention/conversation time** (e.g. input timestamp 22 July + "I went camping last month" ⇒ event = June). Emit ranges when only partial dates are resolvable ("June 2024").

**Group vs 1:1.** Your parser already detects this. For group chats, attribution matters more: extract facts *about* a named participant, tagging which `contact_id` each fact concerns, and be conservative about attributing a statement's *content* to the *speaker* vs. a third party mentioned.

**Avoiding hallucinated facts.** Beyond source grounding: WhatsApp corpora are narrow (as one experimenter found, "our conversations revolve around coordinating joint activities"), so the model will be tempted to over-infer. Instruct it to extract only what's explicitly supported, mark inferred/implied items distinctly, and prefer recall-losing precision for a personal knowledge base.

### 4. Email extraction layer

**Ingestion APIs/protocols.**
- **Gmail API**: `messages.list` (Gmail query syntax, e.g. `from:`, `is:unread`) → batch `messages.get` with `format=FULL` or `format=RAW` (RFC 2822). For ongoing sync, use **`history.list` with `startHistoryId`** (incremental, ~2 quota units vs 5 for `messages.list`) rather than re-paginating; `threads` group replies via `References`/`In-Reply-To` headers.
- **Microsoft Graph** (Outlook/M365): `/me/messages`, `internetMessageHeaders`, delta queries for incremental sync.
- **IMAP**: lowest common denominator for arbitrary providers.
- **Google Takeout `.mbox`**: the zero-OAuth path for *historical archive* import — parse with `mbox-reader` + `mailparser` (both MIT, pure JS/TS — **Deno-compatible via `npm:` specifiers, verified 2026-07-03**; both are conventional Node stream/Buffer code covered by Deno 2's node-compat), reconstruct threads via `Message-ID`/`In-Reply-To`/`References`. This is exactly what the GBrain "email-archive-to-brain" recipe does.

**OAuth credential handling (security requirement).** Gmail/Graph live sync requires OAuth access + refresh tokens that grant persistent mailbox read. Store refresh tokens encrypted at rest (never in plaintext config or a committed `.env`), request the minimum read-only scope, and support revocation/rotation so a leaked token can be invalidated without re-onboarding. Treat token compromise as full-mailbox — and therefore full-corpus — exposure in the threat model.

**Thread structure & quoted-reply removal (critical to avoid duplicate extraction).** Email replies embed prior messages, so naively extracting per-message re-extracts the same facts N times. Strip quoted chains and signatures before extraction:
- Open-source: **Mailgun's Talon** (Python-only — **not usable in a Deno/TS pipeline** without shelling out to a separate Python process; verified 2026-07-03, repo is 99.4% Python + scikit-learn), **`planer`** (the JS port of Talon — **this is the one to use on Deno**; `text/plain` needs no DOM, but HTML needs an injected `Document` — **use `linkedom` or `deno-dom`, not jsdom**, which is heavy/fragile under Deno; verified 2026-07-03), **GitHub's `email_reply_parser`** (Ruby, "On DATE, NAME wrote:" heuristics), **web-ridge/email-reply-parser** (Go). Commercial: **SigParser** (returns cleaned body + parsed reply chain as JSON).
- Reality check: there is **no standard reply/signature format**; these are heuristic/ML and constantly hit edge cases (bottom-posting, non-English "On … wrote:", "Sent from my iPhone"). Extract at the **thread level with de-duplication** (fetch the whole Gmail thread, extract from each message's *cleaned* body once, dedup facts) rather than trusting reply-stripping alone.
- Signatures are also a **positive signal**: they carry structured contact facts (title, company, phone) — worth a dedicated signature-parse path feeding facts.

**Distinguishing personal 1:1 mail from newsletters/automated mail** (so you don't pollute Contact Memory with marketing):
- **Header heuristics (fast, deterministic first pass):** presence of `List-Unsubscribe` / `List-Id` ⇒ bulk/newsletter; `Precedence: bulk`/`list`/`junk` ⇒ mass mail; `Auto-Submitted` (value ≠ `no`) ⇒ automated; sender `noreply@`/`no-reply@` ⇒ automated. (Caveat: `Precedence: bulk` is legacy and Google has quietly de-emphasized it; treat as a weak signal, and note headers alone misfire — a personal "Re: Your order" can trip transactional rules.)
- **ML/LLM classifier second pass:** distinguishing human vs machine-generated email is a known production task — Yahoo Mail deployed a **CNN model that beats BERT** (Wu et al., AAAI 2022, arXiv:2112.07742: lifts adjusted-recall from 70.5%→78.8% and precision from 94.7%→96.0%, "deployed into the current production system"). A lightweight classifier or a cheap LLM call on ambiguous mail catches the cases headers miss ("Let's grab lunch to discuss the quarterly numbers" is personal despite no importance signals).
- **Recommendation:** hybrid — deterministic header rules filter the obvious majority, LLM/ML for the ambiguous remainder; only route "personal correspondence" into `ContactExtraction`.

**Attachments.** For a v1 personal contact memory, treat attachments as references/metadata (filename, type) rather than parsing content; add OCR/doc extraction later as its own medium adapter.

**Identity canonicalization is a real design problem.** One person emails from 3+ addresses over years; without resolution you get 3 contacts. Both the GBrain design and Clay/Mesh call this out explicitly (Mesh auto-merges cards "when there's a high degree of confidence"). Build an identity-resolution step keyed on email address + display name + fuzzy match, feeding a canonical `contact_id`.

### 5. Meeting-transcript extraction layer

**Sources & formats.**
- **Zoom**: cloud recordings export **`.vtt`** (WebVTT, timestamped) + optionally live transcript `.txt`; local recordings get no transcript. Note Zoom removed **downloadable captions** as of May 18, 2026 (verified against Zoom KB0063899, 2026-07-03): in-meeting captions remain (with ≤3 min scroll-back) but can no longer be saved/downloaded; retaining speech-to-text now requires the host enabling the **Meeting Transcript** setting per meeting — a host toggle, **not** a paid cloud-recording plan (the earlier "paid plan" framing conflated it with Zoom's separate licensed cloud-recording audio-transcript feature).
- **Otter.ai**: speaker-labeled transcripts; exports **TXT, DOCX, PDF, SRT**; imports audio/video files.
- **Google Meet / Teams**: Gemini/Copilot-generated notes + transcripts; third-party tools (Tactiq, Granola, Fireflies) capture via browser captions or device audio.
- **Manual notes**: unstructured free text.
Build a transcript adapter that normalizes VTT/SRT/TXT/DOCX into `NormalizedTurn[]` with `speaker` + `timestamp` from cues.

**Speaker diarization / attribution is the core challenge.** Diarization gives "Speaker 0/1/2"; you must map those to real `contact_id`s. Best practices:
- **Preserve speaker labels + timestamps into the LLM** — merging speakers or dropping timestamps "force[s] the LLM to infer turn-taking — a major source of false attribution."
- **Pair diarization with the participant list** (calendar invite attendees / meeting metadata) to convert "Speaker 1" → a named contact. This is exactly how commercial tools do it (Granola: "Speaker identification pairs diarization data with names pulled from calendar invites or participant lists").
- **Name verification pass**: confirm speaker labels match attendees before trusting attributions; misattribution creates misleading per-person facts.

**Verbatim transcript vs summarized notes as input.** Verbatim transcripts are noisy but complete and preserve exact attributions; AI-summarized notes are cleaner but already lossy and may have baked in attribution errors or hallucinated action items. **Prefer verbatim transcripts as extraction input when available** (you control grounding); treat pre-summarized notes as lower-confidence sources. AssemblyAI/Gladia/Granola all note that explicit language ("I will," "can you send," "by Friday") extracts reliably while **implied/hedged commitments need human review**.

**Per-person facts & action-items in multi-party settings.** Unlike 1:1 chat, a transcript needs *per-speaker* attribution of commitments. Recommended pattern:
- **Dual-prompt chaining**: first pass "identify all explicit commitments, conditional assignments, and unresolved decisions with owner + deadline"; second pass summarize topics *excluding* inferred commitments.
- **Uncertainty tagging**: append `[UNCERTAIN]` (or set low confidence) to any action item lacking a named owner AND a deadline.
- Extract per-speaker **persona/profile signals** from that contact's longer monologues (goals, positions, interests) — the "Point of Order" civic-simulation work (arXiv:2511.17813) extracts persona profiles from a speaker's 25 longest monologues, a useful pattern for building a contact's interests/sentiment items.

### 6. Existing tools — what to borrow and what to ignore

| Tool | Ingestion | Extraction approach | Lesson for you |
|---|---|---|---|
| **Monica** (OSS, AGPLv3, Laravel) | 100% manual (+CSV, CalDAV/CardDAV) | **None** — explicitly "not a smart assistant," no AI, no email/calendar read | Its **relational fact schema** is the reference for your `ContactShard`: typed child tables — `activities` (with `activity_type`/category), `reminders`, `special_dates`, `life_events` (45+ types on a timeline), `notes`, `conversations/messages`, `gifts`, `debts`, `relationships` (with forward+reverse labels), `journal`. Account→Vault→Contact multitenancy. |
| **Dex** | Email **metadata only** (subject + date, *not body*), calendar attendee-match, LinkedIn job-change tracking, forward-to-`add@getdex.com` | Rule-based: match attendees/senders → timeline events; LinkedIn job changes; Copilot LLM summaries; now MCP-enabled | Metadata-only is the privacy-conservative default; forward-to-email is a cheap ingestion channel; job-change detection is a high-value derived fact. |
| **Clay/Mesh** (rebranded Clay→Mesh 2024; acquired by Automattic June 2025) | Email, calendar, iMessage, WhatsApp, phone, LinkedIn, Twitter, FB/IG | Auto-creates + enriches "cards" (bio, work history, **job changes, news mentions**), meeting-frequency **"going cold" scoring**, confidence-based auto-merge | "Going cold"/relationship-strength scoring and confidence-gated identity merge are strong product patterns. |
| **GBrain** (OSS, Garry Tan) | Meetings, live email + `.mbox` archive, tweets, voice, calls | **LLM for judgment + deterministic zero-LLM graph edges**; "compiled truth + timeline" pages; provenance to source message IDs; nightly consolidation "dreaming cycle" | The single best architectural template: deterministic parse, LLM extract, deterministic graph/provenance, append-only timeline + compiled current-truth. |
| **Khoj / Reor** (OSS) | Docs/notes | RAG chunk+embed only (LanceDB/pgvector) — **no per-person structured extraction** | Confirms RAG-only ≠ contact memory; you specifically need typed extraction, not just semantic search. |
| **Mem0 / Zep** (agent memory) | Conversation messages | extract→update two-phase, conflict detection, Zep bitemporal graph | Borrow the two-phase extract-then-reconcile and bitemporal storage; don't over-adopt heavy graph infra for v1. |

**Building blocks worth adopting directly:** Google **LangExtract** (source-grounding pattern), **Instructor-JS + Zod** (typed extraction on your stack), **`planer`** (reply/signature stripping — the JS/Deno-usable port of Talon; Talon itself is Python-only, see §4), **mbox-reader/mailparser** (archive import), Airbyte's **connector/adapter model** (conceptual template for pluggable medium sources — each source is a self-contained connector against a shared protocol).

**GBrain — broader applicability beyond Contact Memory (noted 2026-07-03).** [garrytan/gbrain](https://github.com/garrytan/gbrain) is a full Postgres-native personal-knowledge brain (MIT, ~47-op `BrainEngine` contract, PGLite or Postgres+pgvector), not just a contact tool. Two patterns are reusable across **other ai-memory products still to be built**:
- **Wiki tier (where GBrain fits best).** Its *markdown-pages-as-system-of-record + self-wiring typed graph* — auto-link on every `put_page`, zero-LLM edge derivation from `[[wikilink]]` / typed-link syntax — is a strong template for a **Wiki tier** where content is *authored/structured* rather than extracted from raw prose. That is exactly the case where the zero-LLM graph-wiring pays off (contrast A3: it does **not** pay off on raw conversation). Schema-packs (per-brain page-type taxonomies with `extractable` / `expert_routing` flags) map onto a Wiki/Views layer directly.
- **Reusable engine patterns for Developer/other memory products.** Hybrid search (vector + BM25 + RRF + source-tier boost + reranker + per-query graph signals), synthesis-with-gap-analysis (`gbrain think` — answer + citations + "what the brain doesn't know yet"), and the overnight *dream-cycle* consolidation (dedup, citation-fix, contradiction detection) are directly relevant to planned Developer Memory and Wiki tracks.

Capture GBrain as a **reference architecture** for those tracks. For Contact Memory specifically, the transfer is limited to the parse→extract split and the source-grounding discipline (see A3 for why the graph layer does not transfer to conversational input).

### 7. Extensibility to future mediums (Signal, Telegram, SMS, Slack, voice memos)
The abstraction boundary that makes this cheap:
- **Medium adapter interface** (the only thing you implement per new medium): `parse(raw) → NormalizedConversation` + a `MediumProfile` declaring metadata (is it multi-party? does it have reliable timestamps? diarization confidence? is content likely automated?). Signal/Telegram/SMS are near-identical to WhatsApp (timestamped `Name: message`); Slack adds threads/channels (reuse the group-chat path); voice memos add a transcription front-end (Whisper/AssemblyAI) that emits the same `NormalizedTurn[]`.
- **Everything downstream shares one code path**: the `NormalizedConversation → ContactExtraction` extractor, confidence scoring, dedup, conflict resolution, and human-review UI are reused across mediums rather than reimplemented. This is *code* reuse, not prompt-identical behavior — the extractor still branches on `MediumProfile` capability flags (per-speaker attribution for multi-party, relaxed temporal grounding for low-timestamp-reliability sources), so "no extractor changes" means "no new code path," not "no medium-specific logic."
- **Register adapters in a table** with capability flags so the extractor can adjust prompts (e.g. multi-party ⇒ enforce per-speaker attribution; low-timestamp-reliability ⇒ relax temporal grounding).
- This is precisely the connector/CDK pattern Airbyte uses (600+ connectors against one protocol) and the "skills/recipes per source" pattern GBrain uses.

## Details / Design Recommendations (concrete, for your stack)

**Pipeline (per ingested conversation):**
1. **Adapter** (medium-specific, Deno/TS): raw → `NormalizedConversation` (turns with `source_id`, speaker, ISO timestamp, thread_id).
2. **Pre-filter** (deterministic): email header rules to drop bulk/automated; identity canonicalization to assign `contact_id`s; conversation segmentation (time-gap) + overlapping-window chunking.
3. **Extract** (shared LLM stage): schema-constrained call → `ContactExtraction[]`, each item carrying `{kind, payload, quote, source_ids, resolved_entities, absolute_dates, self_confidence}`. Prompt enforces coreference resolution, timestamp/speaker on every fact, event-vs-mention time, verbatim quotes. Optionally multi-pass for recall + self-consistency (k runs — see the fact-equality note in §2) for confidence.
   > **Shape note (2026-07-03, ST-074):** this `{kind, payload, quote, source_ids, …}` shape is *illustrative*. The implemented [`ExtractionItem`](../../contact-memory/parser/types.ts) is a **flattened discriminated union** (per-kind fields extend `ExtractionItemBase`) with provenance in `evidence: EvidenceReference[]` — there is no top-level `payload`, `char_span`, or `source_ids`, and the commit adapter canonically consumes `evidence[0]` (the parser's highest-confidence extraction). Reconciliation is tracked as **ST-074**: add pure accessor helpers (`getPrimaryQuote` / `getAllSourceIds`) and document that `evidence[0]` convention, rather than restructuring the union.
4. **Validate** (deterministic): assert each `quote` appears in cited `source_ids`; drop confidence < ~0.4; Zod-validate against the union.
5. **Reconcile** (deterministic + light LLM): embed + dedup (cosine ~0.7); detect conflicts against existing `ContactShard`; resolve current-value fields by `max(valid_at)` in code; write append-only with `supersedes` chain and provenance.
6. **Review UI**: mid-confidence items surface as suggested facts pending user confirmation (unifies with your manual-facts path).

**Storage (Postgres/pgvector):** facts table with `contact_id, kind, payload jsonb, quote, source_ids[], medium, valid_at, recorded_at, superseded_by, confidence, review_status, embedding vector`. Bitemporal + provenance + embedding in one row supports dedup, conflict resolution, and retrieval without extra infra. **Encryption at rest is a requirement, not an option:** this table holds highly personal PII (verbatim quotes, relationships, commitments, contact identities); enable database/volume encryption at rest and encrypted backups so a stolen disk or backup image cannot expose the corpus in cleartext. **Reconcile with the existing commit path — decision (2026-07-03): the ai-memory platform layer is sufficient.** The `contact-memory/` codebase already persists shards append-only via the platform `capture_thought` MCP tool. Persist facts through that existing path rather than standing up a separate bitemporal facts store; layer dedup/supersession/conflict-resolution as product-side logic over it (e.g. a derived current-value view), keeping the platform as the single system of record. The bitemporal columns described above become properties of the product view, not a competing store.

**Model/prompt notes:** keep one schema per extraction kind, or a two-stage identify→classify; reasoning/evidence fields before answer fields; optional fields for maybe-absent data; few-shot examples with verbatim (non-paraphrased) extraction text.

## Recommendations (staged)

**Stage 1 — Harden the WhatsApp AI layer (you have the parser).** Implement the shared `NormalizedConversation` IR + the schema-constrained extractor (Zod + native structured outputs, optionally Instructor-JS). Bake in source grounding (verbatim quote + `source_id` validation), coreference/temporal-normalization prompt rules, and confidence filtering. Add the deterministic reconcile step with bitemporal storage. *Benchmark to advance:* on a hand-labeled sample of your own chats, precision of auto-accepted facts ≥ ~90% and quote-validation catching ≥ 95% of fabricated spans.

**Stage 2 — Email.** Start with **Google Takeout `.mbox`** historical import (no OAuth) using mbox-reader/mailparser + Talon/planer reply-stripping, thread-level extraction with dedup, and header-based bulk/automated filtering + identity canonicalization. Then add live **Gmail API** sync via `history.list`. *Benchmark:* duplicate-fact rate from quoted chains < 5%; newsletter/automated mail correctly excluded > 95%.

**Stage 3 — Transcripts.** Transcript adapter for VTT/SRT/TXT/DOCX + speaker→attendee mapping from calendar metadata; dual-prompt chaining for commitments; `[UNCERTAIN]` tagging for owner/deadline-less items. Prefer verbatim transcripts; mark pre-summarized notes as lower-confidence.

**Stage 4 — Generalize.** Formalize the `MediumAdapter` interface + capability registry; add Signal/Telegram/SMS (WhatsApp-like), Slack (group path), voice memos (Whisper front-end). Adding a medium requires no new extractor *code path*, but may still require a new `MediumProfile` capability flag and its prompt branch when the medium has attribution or timestamp characteristics not already covered.

**Thresholds that change the plan:** if self-reported confidence proves poorly calibrated on your data, switch to self-consistency (k-run consensus) as the primary confidence signal. If deterministic recency resolution mis-handles legitimately co-current facts, add question-type-aware handling rather than reintroducing LLM freshness judgment. If reply-stripping edge cases leak duplicates, move fully to thread-level extraction + embedding dedup.

## Caveats
- **Accuracy ceiling (cross-domain figures — not yet validated here):** general LLM extraction agrees with human coding only ~62–72% (Gemini 1.5 Flash 71.2%, Pro 72.1%, Mistral Large 2 62.4%) — but that figure is from a *systematic-review data-extraction* task (Konet et al.), and the 50–87pp conflict-resolution advantage cited above is from *MemoryAgentBench*; neither measured conversational contact extraction from chat/email/transcripts. Treat both as directional priors, not calibrated expectations for this pipeline, and re-measure human-agreement on a labeled sample of your own data before sizing review load. A human-in-the-loop confirmation step is required for a trustworthy personal knowledge base, not optional. Self-reported confidence is a coarse filter, not calibrated truth.
- **Borrowed thresholds are uncalibrated placeholders:** the ~0.4 confidence-discard cutoff and 0.7 cosine dedup threshold are inherited from a single external study (Llama-3.3-70B at temp 0.8, arXiv:2606.06614) on a different task and model. Do not treat them as tuned defaults — calibrate both on a labeled sample of your own data before wiring them into Stage 1 gates; the right values may differ by medium and model.
- **Privacy/sensitivity:** this pipeline ingests deeply personal data. Header-based filtering, on-device/self-hosted model options, and clear provenance are risk-mitigations, not afterthoughts. WhatsApp corpora are narrow and dated (models may extract stale facts as current — hence bitemporal storage).
- **Source quality flags:** several tool-comparison claims (Clay/Mesh/Dex signal extraction) come from vendor/competitor blogs (many authored by Dex, a competitor), not independent engineering docs; treat pipeline specifics as vendor descriptions. GBrain metrics (page counts, benchmark numbers) are self-reported. Zoom's caption/transcript access rules changed mid-2026 — verify current export capabilities before building the Zoom path.
- **No standard formats:** email reply/signature structure and transcript formats vary widely; heuristic parsers will need ongoing edge-case maintenance. Budget for it.
- **Cost:** per-write LLM extraction + multi-pass + self-consistency multiplies token cost; batch and downsample high-volume mediums, and reserve multi-pass for high-value conversations.

## Deferred / Open Questions

### From 2026-07-03 review

> **Deployment context (decided 2026-07-03):** hosted, single-tenant (cloud, my data only). This frames the security resolutions below — at-rest/in-transit controls apply, but there is no cross-tenant isolation obligation.

- **No user-facing outcome defined for the memory** — TL;DR / Key Findings (P1, product-lens, confidence 75)

  The pipeline optimizes an internal proxy — facts extracted with high precision — but never states the user-facing job the memory serves (e.g. "never forget what I promised someone," "prep before a call"). Without that outcome there is no basis to prioritize which facts matter, tune recall-vs-precision, or judge whether the system is succeeding. Define the concrete user outcome before committing to the extraction schema.

  **Resolved (2026-07-03):** Core user job = help me remember details about people — what I've promised them and what I know about them. Prioritize commitments (promises made/owed) and durable personal facts; meeting-prep recall is the headline use case.

  <!-- dedup-key: section="tldr key findings" title="no userfacing outcome defined for the memory" evidence="precision of auto-accepted facts ≥ ~90% and quote-validation catching ≥ 95% of fabricated spans" -->

- **Mandatory human gate taxes the automatic-memory value proposition** — Key Findings #2 / Caveats (P1, product-lens, confidence 75)

  The doc's value rests on memory that accrues automatically, but a 62–72% accuracy ceiling forces a mandatory human-in-the-loop confirmation step on every mid-confidence fact. At real message volume the review burden is never modeled, and it may erode the "automatic" promise into a manual triage queue. Decide whether the product tolerates that review load, or whether the accuracy bar / auto-accept policy needs rethinking.

  **Resolved (2026-07-03):** Accept a tiered review model — auto-accept high-confidence facts, queue only mid-confidence for confirmation, auto-drop low. The review queue is a product surface, not a blocker; the "automatic" promise holds for high-confidence facts.

  <!-- dedup-key: section="key findings 2 caveats" title="mandatory human gate taxes the automaticmemory value proposition" evidence="general LLM extraction agrees with human coding only ~62–72% of the time, so a human-in-the-loop gate is not optional" -->

- **Verbatim PII egress to third-party LLM is unbounded** — §2 LLM structured extraction (P1, security-lens, confidence 75)

  Every extraction call ships verbatim personal messages (chat, email, transcripts) to a third-party LLM provider, yet self-hosting is listed only as an optional "mitigation" with no data-sharing posture decided. For deeply personal contact data this is a material privacy and possibly legal exposure. Decide the data-sharing posture — provider DPA/no-train guarantees, redaction before egress, or self-hosted inference — before building the extraction stage.

  **Resolved (2026-07-03):** Ship verbatim text to a third-party LLM only under a no-train / zero-data-retention contract (enterprise or ZDR endpoint). No self-hosting requirement for v1; revisit if the DPA posture changes.

  <!-- dedup-key: section="2 llm structured extraction" title="verbatim pii egress to thirdparty llm is unbounded" evidence="on-device/self-hosted model options, and clear provenance are risk-mitigations, not afterthoughts" -->

- **No data retention, deletion, or erasure path** — Details / Design Recommendations (P1, security-lens, confidence 75)

  Storage is append-only with a supersedes chain, but there is no defined path to delete a contact, honor a right-to-erasure request, or purge data when a source is disconnected. Append-only by design makes erasure structurally impossible unless a deletion/tombstone mechanism is planned in. Define retention limits and a hard-delete/erasure path alongside the bitemporal model.

  **Resolved (2026-07-03):** Keep append-only bitemporal history but add a hard-delete/tombstone path — deleting a contact removes all derived facts + provenance and honors a right-to-erasure request.

  <!-- dedup-key: section="details design recommendations" title="no data retention deletion or erasure path" evidence="store facts append-only with valid_at/recorded_at bitemporal timestamps and a supersedes chain" -->

- **No consent or lawful-basis model for third-party data subjects** — §5 Meeting-transcript extraction layer (P1, security-lens, confidence 75)

  The transcript layer extracts per-speaker persona profiles — goals, positions, interests — about meeting participants who never consented to being profiled, and the same applies to third parties named in chats and emails. This is a consent/lawful-basis gap that carries legal risk depending on jurisdiction and deployment (personal vs hosted). Define whose data may be stored, on what basis, and what happens on objection.

  **Resolved (2026-07-03):** Rely on the personal-use / household basis (hosted single-tenant, my data only), log a lawful-basis note, and honor deletion of a third party's data on request (uses the S4 hard-delete path).

  <!-- dedup-key: section="5 meetingtranscript extraction layer" title="no consent or lawfulbasis model for thirdparty data subjects" evidence="Extract per-speaker persona/profile signals from that contact's longer monologues (goals, positions, interests)" -->

- **Zero-LLM typed graph edges mechanism unexplained, may not transfer** — Key Finding 1 (P1, adversarial, confidence 75)

  The design leans on GBrain's claim that typed graph edges (works_at, invested_in, founded) are derived with zero LLM calls, and treats it as directly borrowable. But GBrain likely derives those edges from structured inputs (calendar, LinkedIn, profile pages), not free-form chat prose — the mechanism is never explained. If the source signal is not present in conversational text, the zero-LLM approach will not transfer and relationship structure quietly falls back to LLM inference. Verify how the edges are actually derived before depending on it.

  **Resolved (2026-07-03):** Verified against [garrytan/gbrain](https://github.com/garrytan/gbrain) — the zero-LLM edges are pattern-matched from `[[wikilink]]` / typed-link syntax already in the page markdown, not extracted from prose. Does not transfer to raw conversation: the LLM extraction stage must emit typed refs first, then deterministic graph-wiring applies. See the correction added to Key Finding 1.

  <!-- dedup-key: section="key finding 1" title="zerollm typed graph edges mechanism unexplained may not transfer" evidence="GBrain extracts typed graph edges (attended, works_at, invested_in, founded, advises, mentions) with zero LLM calls" -->