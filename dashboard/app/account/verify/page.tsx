import type { Metadata } from "next";
import { AccountLinkPage } from "@/components/account/account-link-page";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Confirm email · CourtLens", robots: { index: false, follow: false } };

/** Accounts plan: the confirmation link from the sign-up email. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  return (
    <PageShell template="article">
      <PageHeader title="Confirm your email" subtitle="Finish creating your CourtLens account." />
      <AccountLinkPage kind="verify" token={typeof token === "string" ? token : null} />
    </PageShell>
  );
}
