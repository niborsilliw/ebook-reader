import type { MetadataRoute } from "next";

// Lets readers add Nancy to their phone's home screen: it opens full-screen,
// with no browser bars, and "Nancy" under the icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nancy",
    short_name: "Nancy",
    start_url: "/library",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
