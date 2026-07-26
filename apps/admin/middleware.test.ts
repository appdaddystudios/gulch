import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { middleware } from "./middleware";

const makeRequest = (authorization?: string): NextRequest =>
  new NextRequest("http://localhost/", {
    headers: authorization ? { authorization } : {}
  });

const basic = (credentials: string): string => `Basic ${btoa(credentials)}`;

afterEach(() => {
  delete process.env.ADMIN_BASIC_AUTH;
});

describe("middleware", () => {
  it("passes requests through when no gate is configured", () => {
    delete process.env.ADMIN_BASIC_AUTH;

    expect(middleware(makeRequest()).status).toBe(200);
  });

  it("rejects requests without credentials when the gate is configured", () => {
    process.env.ADMIN_BASIC_AUTH = "gulch:secret";

    const response = middleware(makeRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("rejects wrong credentials", () => {
    process.env.ADMIN_BASIC_AUTH = "gulch:secret";

    expect(middleware(makeRequest(basic("gulch:wrong"))).status).toBe(401);
  });

  it("rejects malformed authorization headers", () => {
    process.env.ADMIN_BASIC_AUTH = "gulch:secret";

    expect(middleware(makeRequest("Basic not-base64!!!")).status).toBe(401);
  });

  it("passes requests with matching credentials", () => {
    process.env.ADMIN_BASIC_AUTH = "gulch:secret";

    expect(middleware(makeRequest(basic("gulch:secret"))).status).toBe(200);
  });
});
