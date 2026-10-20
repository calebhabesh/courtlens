import { redirect } from "next/navigation";

/** Contracts moved to one page (alignment row 14); old team links keep working. */
export default async function Page({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ team }, raw] = await Promise.all([params, searchParams]);
  const next = new URLSearchParams({ team: team.toUpperCase() });
  if (typeof raw.refresh === "string") next.set("refresh", raw.refresh);
  redirect(`/contracts?${next}`);
}
