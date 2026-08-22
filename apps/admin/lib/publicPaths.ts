// Routes the edge gate (proxy.ts) lets through without a session. Everything
// else must be signed in; the allowlist check happens in page/actions.
const PUBLIC_PREFIXES: readonly string[] = ["/sign-in", "/unauthorized"];

const matchesPrefix = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
