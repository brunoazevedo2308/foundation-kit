import { describe, expect, it } from "vitest";
import { isRedirect } from "@tanstack/react-router";

import { Route } from "./index";

describe("root route", () => {
  it("redirects visitors to the authenticated dashboard entry point", () => {
    try {
      Route.options.beforeLoad?.({} as never);
      throw new Error("Expected the root route to redirect");
    } catch (error) {
      expect(isRedirect(error)).toBe(true);
      expect(error).toMatchObject({ options: { to: "/dashboard", replace: true } });
    }
  });
});
