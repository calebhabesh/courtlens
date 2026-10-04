import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "CourtLoad NBA Research", short_name: "CourtLoad", lang: "en",
    description: "Local NBA research and retained analytical evidence. Requires the local API for data views.",
    start_url: "/stats", scope: "/", display: "standalone", background_color: "#0b0d10", theme_color: "#0b0d10",
    icons: [{src:"/icons/courtload-192.png",sizes:"192x192",type:"image/png",purpose:"any"},{src:"/icons/courtload-512.png",sizes:"512x512",type:"image/png",purpose:"any"},{src:"/icons/courtload-maskable-512.png",sizes:"512x512",type:"image/png",purpose:"maskable"}],
    shortcuts: [{name:"Saved investigations",url:"/investigations"},{name:"Manual research",url:"/research/ask"}]
  };
}
