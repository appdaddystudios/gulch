import { NextResponse, type NextRequest } from "next/server";

// Access gate for the moment this dashboard leaves localhost: set
// ADMIN_BASIC_AUTH="user:password" and every request — pages and Server
// Action POSTs alike — must present matching Basic credentials. Unset means
// open, which is the locked local-only/no-auth posture for this pass.
const decodeBasicCredentials = (header: string | null): string | null => {
  if (!header) {
    return null;
  }
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    return null;
  }
  try {
    return atob(encoded);
  } catch {
    return null;
  }
};

export function middleware(request: NextRequest) {
  const expected = process.env.ADMIN_BASIC_AUTH;
  if (!expected) {
    return NextResponse.next();
  }

  if (decodeBasicCredentials(request.headers.get("authorization")) === expected) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Gulch Admin"' }
  });
}
