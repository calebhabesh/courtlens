import type { Metadata } from "next";
import { DataBadge } from "@/components/data-badge";
import { PlayerSearch } from "@/components/player-search";
import { getDataStatus } from "@/lib/api";

export const metadata: Metadata = { title: "Player form explorer" };
export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const status = await getDataStatus();
  return (
    <section className="page shell">
      <div className="page-heading">
        <div>
          <p className="kicker">Point-in-time explorer</p>
          <h1>Player form</h1>
          <p>Inspect descriptive production with the sample size and scoring cutoff kept visible.</p>
        </div>
        <DataBadge status={status} />
      </div>
      <PlayerSearch />
    </section>
  );
}
