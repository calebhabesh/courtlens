import type { Metadata } from "next";
import { AccountLinkPage } from "@/components/account/account-link-page";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Reset password · CourtLens", robots: { index: false, follow: false } };

/** Accounts plan: the reset link from the "forgot password" email. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  return (
    <PageShell template="article">
      <PageHeader title="Choose a new password" subtitle="The link works once and expires an hour after it was sent." />
      <AccountLinkPage kind="reset" token={typeof token === "string" ? token : null} />
    </PageShell>
  );
}
