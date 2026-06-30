export function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(message ?? `Expected ${right}, got ${left}`);
  }
}

export function assertMatch(actual: string, pattern: RegExp): void {
  if (!pattern.test(actual)) throw new Error(`Expected ${actual} to match ${pattern}`);
}

export const envelope = {
  cmsLocaleId: "locale-123",
  lastPublished: "2026-06-01T12:00:00.000Z",
  createdOn: "2026-05-01T12:00:00.000Z",
  isArchived: false,
  isDraft: false
};

