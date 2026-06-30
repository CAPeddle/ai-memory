export type ValidatedTag = string & { readonly __validatedTag: unique symbol };

export interface TagValidationError {
  error: true;
  message: string;
  received: string;
  expected: string;
}

export const TAG_PATTERN = /^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)?$/;
export const MAX_TAGS = 16;
export const MAX_TAG_LENGTH = 64;

export function isValidatedTag(value: string): value is ValidatedTag {
  return value.length <= MAX_TAG_LENGTH && TAG_PATTERN.test(value);
}

export function validateTag(
  tag: string,
  received = tag,
): ValidatedTag | TagValidationError {
  if (tag !== tag.trim()) {
    return {
      error: true,
      message:
        `Invalid tag "${tag}" — tags must not include surrounding whitespace`,
      received,
      expected:
        "Lowercase tags matching /^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)?$/",
    };
  }

  if (tag.length > MAX_TAG_LENGTH || !TAG_PATTERN.test(tag)) {
    return {
      error: true,
      message:
        `Invalid tag "${tag}" — tags must be lowercase and may include one namespace separator`,
      received,
      expected:
        "Lowercase tags matching /^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)?$/",
    };
  }

  return tag as ValidatedTag;
}

export function parseTagList(
  rawTags: string,
): ValidatedTag[] | TagValidationError {
  const tags: ValidatedTag[] = [];
  const seen = new Set<string>();

  for (const tag of rawTags.split(";")) {
    if (!tag) {
      return {
        error: true,
        message: "Invalid tags value — empty tag segments are not allowed",
        received: rawTags,
        expected:
          'Tags separated by semicolons. Example: "tags:developer;contact"',
      };
    }

    const validated = validateTag(tag, rawTags);
    if (isTagValidationError(validated)) return validated;

    if (!seen.has(validated)) {
      seen.add(validated);
      tags.push(validated);
    }
  }

  if (tags.length > MAX_TAGS) {
    return {
      error: true,
      message: `Too many tags — maximum is ${MAX_TAGS}`,
      received: rawTags,
      expected: `At most ${MAX_TAGS} semicolon-separated tags`,
    };
  }

  return tags;
}

export function ensureValidatedTags(
  tags: readonly string[],
): ValidatedTag[] | TagValidationError {
  const validatedTags: ValidatedTag[] = [];
  const seen = new Set<string>();
  const received = tags.join(";");

  for (const tag of tags) {
    const validated = validateTag(tag, received);
    if (isTagValidationError(validated)) return validated;
    if (!seen.has(validated)) {
      seen.add(validated);
      validatedTags.push(validated);
    }
  }

  if (validatedTags.length > MAX_TAGS) {
    return {
      error: true,
      message: `Too many tags — maximum is ${MAX_TAGS}`,
      received,
      expected: `At most ${MAX_TAGS} semicolon-separated tags`,
    };
  }

  return validatedTags;
}

export function isTagValidationError(
  result: ValidatedTag | ValidatedTag[] | TagValidationError,
): result is TagValidationError {
  return typeof result === "object" && result !== null && "error" in result &&
    result.error === true;
}
