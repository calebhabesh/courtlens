import type { Metadata } from "next";
import { IntentLink } from "@/components/intent-link";
import { ArticleLayout, ArticleSection } from "@/components/ui/article-layout";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { CONTACT_EMAIL, POLICY_UPDATED } from "@/lib/site-policy";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using CourtLens, a free, non-commercial basketball analytics site.",
};

const TOC = [
  { id: "service", label: "The service" },
  { id: "accounts", label: "Accounts" },
  { id: "use", label: "Acceptable use" },
  { id: "content", label: "Data and Ask answers" },
  { id: "warranty", label: "No warranty" },
  { id: "ending", label: "Ending" },
  { id: "changes", label: "Changes and contact" },
];

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

/** Accounts plan: the terms of service Google's consent screen links to. */
export default function TermsPage() {
  return (
    <PageShell template="article">
      <PageHeader title="Terms of Service" subtitle={`Last updated ${POLICY_UPDATED}. By using CourtLens you agree to these terms.`} />
      <ArticleLayout toc={TOC}>
        <ArticleSection id="service" title="The service">
          <p>CourtLens (courtlens.calebhabesh.com) is a free, non-commercial basketball analytics site and portfolio project run by Caleb Habesh. It is unofficial and not affiliated with the NBA or any team. It may change, pause or shut down at any time.</p>
        </ArticleSection>

        <ArticleSection id="accounts" title="Accounts">
          <p>You can use an account you create (with a password or Google) or the shared demo account. Keep your password to yourself; you are responsible for what is done with your account. The demo account is shared with everyone and reset every night, so don&apos;t put anything personal in it.</p>
          <p>How account data is handled is described in the <IntentLink href="/privacy">Privacy Policy</IntentLink>.</p>
        </ArticleSection>

        <ArticleSection id="use" title="Acceptable use">
          <p>Don&apos;t:</p>
          <ul>
            <li>try to break into, overload or disrupt the site, or get around its rate limits;</li>
            <li>scrape it at a volume that degrades it for others, or resell its data;</li>
            <li>create accounts in bulk or in someone else&apos;s name;</li>
            <li>use Ask to produce unlawful or abusive content.</li>
          </ul>
        </ArticleSection>

        <ArticleSection id="content" title="Data and Ask answers">
          <p>Statistics, models and forecasts are offered for information and entertainment. They can be incomplete, late or wrong, and forecasts are estimates, not guarantees. Don&apos;t rely on them for betting or other financial decisions.</p>
          <p>Ask&apos;s answers are written by AI models and can be mistaken. Check anything that matters.</p>
        </ArticleSection>

        <ArticleSection id="warranty" title="No warranty">
          <p>CourtLens is provided &ldquo;as is&rdquo;, without warranties of any kind. To the extent the law allows, its operator isn&apos;t liable for any loss arising from using it or being unable to use it.</p>
        </ArticleSection>

        <ArticleSection id="ending" title="Ending">
          <p>You can stop using CourtLens and delete your account at any time from the account menu. An account that breaks these terms may be suspended or deleted.</p>
        </ArticleSection>

        <ArticleSection id="changes" title="Changes and contact">
          <p>If these terms change, the date at the top changes with them. Questions go to {mail}.</p>
        </ArticleSection>
      </ArticleLayout>
    </PageShell>
  );
}
