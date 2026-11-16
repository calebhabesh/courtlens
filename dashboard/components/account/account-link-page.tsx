"use client";

import { useId, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "../ui/kit";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { useAccount } from "../../lib/account-context";

/**
 * Accounts plan: the page an emailed link opens. Mail scanners open links too, so nothing happens
 * until the person presses the button (a POST through the account proxy).
 */
export function AccountLinkPage({ kind, token }: { kind: "verify" | "reset"; token: string | null }) {
  const { confirmEmail, resetPassword, openSignIn } = useAccount();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const passwordId = useId();

  if (!token) {
    return (
      <div className="account-link">
        <p>This link is incomplete. Open it again from the email, or ask for a new one.</p>
        <div><Button variant="secondary" size="md" onClick={() => openSignIn()}>Sign in</Button></div>
      </div>
    );
  }
  if (done) {
    return (
      <div className="account-link" role="status">
        <p>{kind === "verify" ? "Your email is confirmed and you're signed in." : "Your password is set and you're signed in."}</p>
        <div><ButtonLink variant="primary" size="md" href="/">Go to CourtLens</ButtonLink></div>
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const secret = password;
    setPassword("");
    try {
      if (kind === "verify") await confirmEmail(token);
      else await resetPassword(token, secret);
      setDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="account-link" onSubmit={submit} noValidate>
      {kind === "reset" && (
        <Field label="New password" htmlFor={passwordId} hint="12 characters or more. Other sign-ins end.">
          <Input id={passwordId} type="password" autoComplete="new-password" required minLength={12} maxLength={128}
            value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
        </Field>
      )}
      {error && <p className="account-error" role="alert">{error}</p>}
      <div>
        <Button type="submit" variant="primary" size="md" loading={busy} disabled={busy || (kind === "reset" && password.length < 12)}>
          {kind === "verify" ? "Confirm email" : "Set password"}
        </Button>
      </div>
    </form>
  );
}
