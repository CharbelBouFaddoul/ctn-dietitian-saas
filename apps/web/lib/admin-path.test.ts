import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminPath,
  isAdminLoginPath,
  isHiddenPublicAdminPath,
  normalizeAdminBasePath,
  publicAdminPathname,
  rewriteAdminPathname,
} from "./admin-path.ts";

describe("admin-path", () => {
  it("defaults to a non-guessable console slug", () => {
    assert.equal(normalizeAdminBasePath(""), "/ns-console");
    assert.equal(normalizeAdminBasePath("   "), "/ns-console");
  });

  it("accepts an explicit /admin path", () => {
    assert.equal(normalizeAdminBasePath("/admin"), "/admin");
  });

  it("normalizes slugs and rejects reserved public routes", () => {
    assert.equal(normalizeAdminBasePath("ops-k4m9"), "/ops-k4m9");
    assert.equal(normalizeAdminBasePath("/ctn-ops/"), "/ctn-ops");
    assert.equal(normalizeAdminBasePath("/contact"), "/ns-console");
    assert.equal(normalizeAdminBasePath("/auth"), "/ns-console");
    assert.equal(normalizeAdminBasePath("/"), "/ns-console");
    assert.equal(normalizeAdminBasePath("/a"), "/ns-console");
  });

  it("builds console hrefs from the current base path", () => {
    const previous = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH;
    process.env.NEXT_PUBLIC_ADMIN_BASE_PATH = "/ops-k4m9";
    try {
      assert.equal(adminPath(), "/ops-k4m9");
      assert.equal(adminPath("/"), "/ops-k4m9");
      assert.equal(adminPath("/users"), "/ops-k4m9/users");
      assert.equal(adminPath(`/dietitians/abc?tab=patients`), "/ops-k4m9/dietitians/abc?tab=patients");
      assert.equal(isAdminLoginPath("/ops-k4m9/login"), true);
      assert.equal(isHiddenPublicAdminPath("/admin/login"), true);
      assert.equal(rewriteAdminPathname("/ops-k4m9/users"), "/admin/users");
      assert.equal(publicAdminPathname("/admin/users"), "/ops-k4m9/users");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_ADMIN_BASE_PATH;
      else process.env.NEXT_PUBLIC_ADMIN_BASE_PATH = previous;
    }
  });
});
