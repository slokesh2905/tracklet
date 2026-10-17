import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tracklet · Smart price tracker",
    short_name: "Tracklet",
    description: "Track prices from any store and get alerts when they drop.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f97316",
    orientation: "portrait",
    categories: ["shopping", "productivity"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android Chrome lists the installed app in the share sheet; the link arrives as a GET to /share.
    share_target: { action: "/share", method: "GET", params: { url: "url", text: "text", title: "title" } },
    shortcuts: [
      { name: "Alerts", url: "/alerts" },
      { name: "Collections", url: "/collections" },
    ],
  };
}
