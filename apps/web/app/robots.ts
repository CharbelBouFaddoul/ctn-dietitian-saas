import type { MetadataRoute } from "next";
import { getAdminBasePath } from "../lib/admin-path";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/admin/", `${getAdminBasePath()}`, `${getAdminBasePath()}/`],
    },
  };
}
