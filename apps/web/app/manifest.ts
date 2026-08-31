import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nutrition Client",
    short_name: "Meal Plan",
    description: "View your published nutrition meal plan",
    start_url: "/client",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    icons: [
      { src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { src: "/icon.png", sizes: "32x32", type: "image/png" },
    ],
  };
}
