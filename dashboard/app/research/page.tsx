import { redirect } from "next/navigation";

// The Research landing page was cut (owner, 2026-11-09): the menu leads straight to each page. Old links land on the first Research page.
export default function Page() { redirect("/research/rapm/six-factor"); }
