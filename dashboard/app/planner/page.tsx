import type { Metadata } from "next";
import { PlannerClient } from "@/components/planner-client";
import { getDataStatus } from "@/lib/api";

export const metadata: Metadata = { title: "Weekly roster planner" };
export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const status = await getDataStatus();
  return (
    <section className="page shell wide-shell">
      <div className="page-heading">
        <div>
          <p className="kicker">Private decision workspace</p>
          <h1>Weekly roster planner</h1>
          <p>Count the games your slots can use, then compare one explainable roster change.</p>
        </div>
      </div>
      <PlannerClient fixtureMode={status.classification === "fixture"} />
    </section>
  );
}
