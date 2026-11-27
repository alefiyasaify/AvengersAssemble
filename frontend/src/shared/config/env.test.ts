import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("applies defaults when variables are unset", () => {
    expect(parseServerEnv({})).toEqual({
      APP_ENV: "local",
      BACKEND_INTERNAL_URL: "http://localhost:8000",
    });
  });

  it("strips trailing slashes from the backend URL", () => {
    expect(
      parseServerEnv({ BACKEND_INTERNAL_URL: "http://backend:8000//" }).BACKEND_INTERNAL_URL,
    ).toBe("http://backend:8000");
  });

  it.each([
    { BACKEND_INTERNAL_URL: "not a url" },
    { BACKEND_INTERNAL_URL: "ftp://backend" },
    { APP_ENV: "prod" },
  ])("fails fast on invalid input %j", (source) => {
    expect(() => parseServerEnv(source)).toThrow(/Invalid server environment/);
  });
});

describe("parsePublicEnv", () => {
  it("uses the default app name when unset", () => {
    expect(parsePublicEnv({}).NEXT_PUBLIC_APP_NAME).toBe("Avengers Assemble");
  });

  it("fails fast on a blank app name", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_APP_NAME: "  " })).toThrow(
      /Invalid public environment/,
    );
  });
});
