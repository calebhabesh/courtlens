import type { Metadata } from "next";
import { ArticleLayout, ArticleSection } from "@/components/ui/article-layout";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { CONTACT_EMAIL, POLICY_UPDATED } from "@/lib/site-policy";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What CourtLens collects, why, who it is shared with, how long it is kept and how to delete it.",
};

const TOC = [
  { id: "who", label: "Who runs CourtLens" },
  { id: "collected", label: "What is collected" },
  { id: "use", label: "How it is used" },
  { id: "google", label: "Google user data" },
  { id: "shared", label: "Who it is shared with" },
  { id: "cookies", label: "Cookies" },
  { id: "retention", label: "How long it is kept" },
  { id: "security", label: "Security" },
  { id: "choices", label: "Your choices" },
  { id: "children", label: "Children" },
  { id: "changes", label: "Changes" },
];

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

/** Accounts plan: the privacy policy Google's consent screen links to. */
export default function PrivacyPage() {
  return (
    <PageShell template="article">
      <PageHeader title="Privacy Policy" subtitle={`Last updated ${POLICY_UPDATED}. CourtLens is a free, non-commercial basketball analytics site. It has no ads and no trackers, and it sells nothing.`} />
      <ArticleLayout toc={TOC}>
        <ArticleSection id="who" title="Who runs CourtLens">
          <p>CourtLens (courtlens.calebhabesh.com) is a personal portfolio project run by Caleb Habesh, an individual, not a company. Questions or requests about your data go to {mail}.</p>
        </ArticleSection>

        <ArticleSection id="collected" title="What is collected">
          <p>Browsing CourtLens without an account collects nothing about you beyond the short-lived server logs described below.</p>
          <p>If you create an account or use one, CourtLens stores:</p>
          <ul>
            <li><strong>Account details:</strong> your email address and the name you choose (or the name your Google account shares).</li>
            <li><strong>Password:</strong> if you set one, a salted Argon2 hash of it. The password itself is never stored.</li>
            <li><strong>Google link:</strong> if you sign in with Google, your Google account ID, so the next sign-in finds the same account.</li>
            <li><strong>Favourite players</strong> you save.</li>
            <li><strong>Ask conversations:</strong> the questions you ask and the answers, so you can return to them.</li>
            <li><strong>Account dates:</strong> when the account was created and when its email was confirmed.</li>
          </ul>
          <p>To run the site, the server also handles your network (IP) address and browser details for each request. Server logs that contain them are size-capped and overwritten as new entries arrive. To enforce Ask&apos;s daily question limit, a one-way hash of your network address is counted in memory; it can&apos;t be turned back into the address, resets each day and isn&apos;t written to the database.</p>
          <p>CourtLens doesn&apos;t collect payment details, location, contacts or any data from other sites.</p>
        </ArticleSection>

        <ArticleSection id="use" title="How it is used">
          <p>Only to provide the features you use: signing you in, keeping your favourite players, answering your Ask questions and keeping your conversations, sending account emails you asked for (confirming your address, resetting your password), and keeping the site working and protected from abuse (rate limits).</p>
          <p>CourtLens doesn&apos;t sell your data, show ads, build advertising profiles, or use your data to train AI models. It sends no marketing email.</p>
        </ArticleSection>

        <ArticleSection id="google" title="Google user data">
          <p>&ldquo;Sign in with Google&rdquo; asks only for the basic scopes <code>openid</code>, <code>email</code> and <code>profile</code>. From them CourtLens receives your Google account ID, email address, whether Google has verified that address, and your name. It uses them only to create your account, sign you in and show your name in the header. CourtLens never sees your Google password and has no access to your Gmail, Drive, contacts or any other Google data.</p>
          <p>Google user data isn&apos;t shared with anyone, sold, used for advertising, or used to train AI models. CourtLens&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer" target="_blank">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
          <p>You can remove CourtLens&apos;s access at any time from your Google account&apos;s <a href="https://myaccount.google.com/connections" rel="noreferrer" target="_blank">third-party connections</a> page, and delete the CourtLens account itself as described below.</p>
        </ArticleSection>

        <ArticleSection id="shared" title="Who it is shared with">
          <p>Nobody, except the services CourtLens runs on, and only as far as each needs:</p>
          <ul>
            <li><strong>Oracle Cloud</strong> hosts the server and database.</li>
            <li><strong>Cloudflare</strong> carries traffic to the site and protects it.</li>
            <li><strong>Resend</strong> delivers account emails, so it receives your email address and the email&apos;s contents.</li>
            <li><strong>Google Gemini and Groq</strong> write Ask&apos;s answers, so they receive the text of your questions and conversation. They don&apos;t receive your email address or name. For some questions the provider also runs a web search.</li>
          </ul>
          <p>CourtLens would also disclose data if the law required it.</p>
        </ArticleSection>

        <ArticleSection id="cookies" title="Cookies">
          <p>Only cookies the site needs to work: your sign-in session, a random ID that keeps Ask conversations to your browser, and a ten-minute cookie while Google sign-in runs. None is used for advertising or analytics, and there are no third-party cookies.</p>
        </ArticleSection>

        <ArticleSection id="retention" title="How long it is kept">
          <ul>
            <li>Your account and everything in it are kept until you delete the account.</li>
            <li>A sign-up that is never confirmed is deleted after 7 days.</li>
            <li>Email links work once and expire after 24 hours (confirm) or 1 hour (password reset).</li>
            <li>Copies in the database backups expire within about two weeks of deletion.</li>
          </ul>
        </ArticleSection>

        <ArticleSection id="security" title="Security">
          <p>All traffic uses HTTPS. Passwords are stored only as salted hashes, email links are stored only as hashes, and the sign-in session lives in an HttpOnly cookie that page scripts can&apos;t read. The database isn&apos;t reachable from the internet. No system is perfectly secure; if a breach affected your data, you would be told by email.</p>
        </ArticleSection>

        <ArticleSection id="choices" title="Your choices">
          <p><strong>Delete your account:</strong> signed in, open the account menu and choose <strong>Delete account</strong>. Your account, favourite players, Google link and Ask conversations are deleted right away.</p>
          <p><strong>Get a copy, correct it, or ask a question:</strong> email {mail} from the address on the account. Requests are answered within 30 days.</p>
        </ArticleSection>

        <ArticleSection id="children" title="Children">
          <p>CourtLens isn&apos;t meant for children under 13, and doesn&apos;t knowingly collect their data. If you believe a child has made an account, email {mail} and it will be deleted.</p>
        </ArticleSection>

        <ArticleSection id="changes" title="Changes">
          <p>If this policy changes, the date at the top changes with it. A change that uses your data in a new way will be emailed to account holders before it applies.</p>
        </ArticleSection>
      </ArticleLayout>
    </PageShell>
  );
}
