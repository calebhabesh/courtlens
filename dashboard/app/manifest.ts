import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "CourtLens NBA Research", short_name: "CourtLens", lang: "en",
    description: "Local NBA research and retained analytical evidence. Requires the local API for data views.",
    start_url: "/stats", scope: "/", display: "standalone", background_color: "#0b0d10", theme_color: "#0b0d10",
    icons: [{src:"/icons/courtlens-192.png",sizes:"192x192",type:"image/png",purpose:"any"},{src:"/icons/courtlens-512.png",sizes:"512x512",type:"image/png",purpose:"any"},{src:"/icons/courtlens-maskable-512.png",sizes:"512x512",type:"image/png",purpose:"maskable"}],
    shortcuts: [{name:"Saved investigations",url:"/investigations"},{name:"Manual research",url:"/research/ask"}]
  };
}
