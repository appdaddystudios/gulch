// Pure helpers for the admin email allowlist (ADMIN_ALLOWED_EMAILS). Kept
// free of env/Clerk access so a table-backed allowlist can replace the parse
// step later without touching callers.

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const parseAllowedEmails = (raw: string | undefined): ReadonlySet<string> => {
  const emails = (raw ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter((email) => email.length > 0);
  return new Set(emails);
};

export const isAllowedEmail = (
  email: string | null | undefined,
  allowed: ReadonlySet<string>
): boolean => {
  if (!email) {
    return false;
  }
  return allowed.has(normalizeEmail(email));
};
