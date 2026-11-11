"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "../ui/kit";
import { Modal } from "../ui/modal";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { AccountRequestError, useAccount } from "../../lib/account-context";

function message(error: unknown): string {
  if (error instanceof AccountRequestError && error.status === 429) {
    const minutes = error.retryAfter ? Math.max(1, Math.ceil(error.retryAfter / 60)) : null;
    return `Too many attempts. Try again${minutes ? ` in ${minutes} minute${minutes === 1 ? "" : "s"}` : " later"}.`;
  }
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

/** Finish plan F04: invite-only sign-in plus the one-click demo account. No sign-up. */
export function SignInDialog() {
  const { signInOpen, signInReason, closeSignIn, signIn, signInDemo } = useAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();
  const passwordId = useId();

  const close = () => {
    setError(null);
    setPassword("");
    closeSignIn();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy("password");
    setError(null);
    try {
      await signIn(email.trim(), password);
      setPassword("");
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(null);
    }
  };

  const demo = async () => {
    if (busy) return;
    setBusy("demo");
    setError(null);
    try {
      await signInDemo();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal isOpen={signInOpen} onClose={close} title="Sign in" className="account-dialog"
      description={signInReason ?? "Sign in to keep your favourite players."}>
      <form className="account-form" onSubmit={submit} noValidate>
        <Field label="Email" htmlFor={emailId}>
          <Input id={emailId} type="email" autoComplete="username" inputMode="email" required
            value={email} onChange={event => setEmail(event.target.value)} disabled={busy !== null} />
        </Field>
        <Field label="Password" htmlFor={passwordId}>
          <Input id={passwordId} type="password" autoComplete="current-password" required
            // Empty as soon as the dialog closes, so the password never lingers in the exiting DOM.
            value={signInOpen ? password : ""} onChange={event => setPassword(event.target.value)} disabled={busy !== null} />
        </Field>
        {error && <p className="account-error" role="alert">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={busy === "password"}
          disabled={busy !== null || !email.trim() || !password}>Sign in</Button>
      </form>
      <div className="account-or" aria-hidden="true"><span>or</span></div>
      <div className="account-demo">
        <Button variant="secondary" size="lg" icon="user" loading={busy === "demo"} disabled={busy !== null} onClick={demo}>
          Use the demo account
        </Button>
        <p>One shared list of favourites for every visitor, reset each night.</p>
      </div>
      <p className="account-note">Accounts are by invitation only.</p>
    </Modal>
  );
}
