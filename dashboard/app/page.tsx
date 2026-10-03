import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      urlParams.set(key, value);
    } else if (Array.isArray(value) && value[0]) {
      urlParams.set(key, value[0]);
    }
  }

  const queryStr = urlParams.toString();
  redirect(`/stats${queryStr ? `?${queryStr}` : ""}`);
}
