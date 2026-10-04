"use client";

import { useEffect, useState } from "react";
type InstallPrompt = Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}>};
export function InstallInterface() {
  const [prompt,setPrompt]=useState<InstallPrompt|null>(null);
  const [installed,setInstalled]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    const standalone=matchMedia("(display-mode: standalone)");
    const update=()=>setInstalled(standalone.matches);
    const available=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPrompt);};
    const done=()=>{setInstalled(true);setPrompt(null);};
    update();standalone.addEventListener("change",update);window.addEventListener("beforeinstallprompt",available);window.addEventListener("appinstalled",done);
    return()=>{standalone.removeEventListener("change",update);window.removeEventListener("beforeinstallprompt",available);window.removeEventListener("appinstalled",done);};
  },[]);
  async function install(){if(!prompt)return;setPrompt(null);try{await prompt.prompt();const choice=await prompt.userChoice;setMessage(choice.outcome==="accepted" ? "Installation accepted by the browser." : "Installation dismissed. Use the browser menu to try again.");}catch{setMessage("Installation unavailable. Use your browser’s install or Add to Home Screen menu.");}}
  return <section className="panel"><h2>Install CourtLoad</h2><p role="status">{installed ? "Running as a standalone app" : "Local browser interface"}{message ? ` · ${message}` : ""}</p>{prompt && !installed && <button className="button" onClick={()=>void install()}>Install local app</button>}<p>On supported browsers, use Install app or Add to Home Screen in the browser menu. Installation requires a secure origin (HTTPS or localhost); availability depends on your browser.</p><p>The icon and app metadata are local assets. Analytical pages, saved evidence, Live and exports require the local API and database. No service worker or offline write synchronization is registered. Browser static-asset caching does not establish current source coverage; analytical fetches use no-store. Inspect Data status for freshness.</p></section>;
}
