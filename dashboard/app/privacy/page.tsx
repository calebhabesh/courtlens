import type { Metadata } from "next";
import { ArticleLayout, ArticleSection } from "@/components/ui/article-layout";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";

export const metadata: Metadata = {
  title: "Privacy · CourtLens",
  description: "What CourtLens stores about accounts and Ask, and how to delete it.",
};

const TOC = [
  { id: "stored", label: "What is stored" },
  { id: "google", label: "Google sign-in" },
  { id: "ask", label: "Ask" },
  { id: "cookies", label: "Cookies" },
  { id: "delete", label: "Deleting your data" },
];

/** Accounts plan: the privacy page Google's consent screen links to. */
export default function PrivacyPage() {
  return (
    <PageShell template="article">
      <PageHeader title="Privacy" subtitle="CourtLens is a free, non-commercial basketball analytics demo. It has no ads, no trackers and sells nothing." />
      <ArticleLayout toc={TOC}>
        <ArticleSection id="stored" title="What is stored">
          <p>An account holds your email address, the name you choose (or the one Google shares), your favourite players and, if you set one, a salted hash of your password. The plain password is never stored.</p>
          <p>Sign-up and password-reset emails contain single-use links that expire within a day. A sign-up that is never confirmed is deleted after a week.</p>
          <p>Browsing without an account stores nothing about you.</p>
        </ArticleSection>
        <ArticleSection id="google" title="Google sign-in">
          <p>Signing in with Google shares your name, email address and Google account ID with CourtLens. CourtLens asks for nothing else and never sees your Google password.</p>
        </ArticleSection>
        <ArticleSection id="ask" title="Ask">
          <p>Asking a question needs an account or the shared demo account. Your conversations are kept so you can come back to them. Questions are sent to the AI providers that write the answers (Google Gemini and Groq on their free tiers) and, for some questions, to a web search.</p>
          <p>A hash of your network address, which can&apos;t be turned back into the address, counts the day&apos;s questions. The count resets at midnight Pacific time and isn&apos;t written to the database.</p>
        </ArticleSection>
        <ArticleSection id="cookies" title="Cookies">
          <p>Only cookies the site needs: your sign-in session, a random ID that keeps Ask conversations to your browser, and a ten-minute cookie while Google sign-in runs. None is used for advertising or analytics.</p>
        </ArticleSection>
        <ArticleSection id="delete" title="Deleting your data">
          <p>Signed in, open the account menu and choose <strong>Delete account</strong>. Your account, favourite players, Google link and Ask conversations are deleted right away. Copies in the nightly backups are gone once those backups expire.</p>
        </ArticleSection>
      </ArticleLayout>
    </PageShell>
  );
}
