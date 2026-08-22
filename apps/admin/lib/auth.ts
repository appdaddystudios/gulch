import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { isAllowedEmail, parseAllowedEmails } from "./allowlist";

// Server-side admin gate. Clerk answers "who is this?"; the allowlist answers
// "may they edit?". Pages use requireAdmin (redirects), Server Actions use
// assertAdmin (throws) — proxy.ts is only a UX redirect, never the authority.

export type AdminIdentity = {
  readonly userId: string;
  readonly email: string | null;
};

export const getAllowedEmails = (): ReadonlySet<string> => {
  const allowed = parseAllowedEmails(process.env.ADMIN_ALLOWED_EMAILS);
  if (allowed.size === 0) {
    throw new Error(
      "ADMIN_ALLOWED_EMAILS is empty — set at least one comma-separated admin email in apps/admin/.env."
    );
  }
  return allowed;
};

type EmailClaims = Readonly<Record<string, unknown>> | null;

// The `email` session claim is a Clerk dashboard setting; fall back to the
// Backend API when it is absent so correctness never depends on that step.
const resolveEmail = async (claims: EmailClaims): Promise<string | null> => {
  const claimed = claims?.email;
  if (typeof claimed === "string") {
    return claimed;
  }
  const user = await currentUser();
  return user?.primaryEmailAddress?.emailAddress ?? null;
};

export const getAdminIdentity = async (): Promise<AdminIdentity | null> => {
  const session = await auth();
  if (!session.userId) {
    return null;
  }
  return { userId: session.userId, email: await resolveEmail(session.sessionClaims) };
};

type AdminCheck = {
  readonly identity: AdminIdentity | null;
  readonly allowed: boolean;
};

const checkAdmin = async (): Promise<AdminCheck> => {
  const allowedEmails = getAllowedEmails();
  const identity = await getAdminIdentity();
  return {
    identity,
    allowed: identity !== null && isAllowedEmail(identity.email, allowedEmails)
  };
};

export const requireAdmin = async (): Promise<AdminIdentity> => {
  const { identity, allowed } = await checkAdmin();
  if (!identity) {
    redirect("/sign-in");
  }
  if (!allowed) {
    redirect("/unauthorized");
  }
  return identity;
};

export const assertAdmin = async (): Promise<AdminIdentity> => {
  const { identity, allowed } = await checkAdmin();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  if (!allowed) {
    throw new Error("Forbidden");
  }
  return identity;
};
