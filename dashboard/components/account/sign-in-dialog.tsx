"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "../ui/kit";
import { Modal } from "../ui/modal";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { IntentLink } from "../intent-link";
import { AccountRequestError, useAccount } from "../../lib/account-context";

/** `choice`: Google, email or the demo; `email`: the password form; then reset and "check your email". */
type Mode = "choice" | "email" | "forgot" | "sent";
/** Whether the person is signing in or creating an account; the footer switches it. */
type Intent = "sign-in" | "sign-up";
type Busy = "form" | "demo" | "google" | null;

function title(mode: Mode, intent: Intent): string {
  if (mode === "forgot") return "Reset Password";
  if (mode === "sent") return "Check Your Email";
  return intent === "sign-up" ? "Create Account" : "Sign In";
}

function message(error: unknown): string {
  if (error instanceof AccountRequestError && error.status === 429) {
    const minutes = error.retryAfter ? Math.max(1, Math.ceil(error.retryAfter / 60)) : null;
    return `Too many attempts. Try again${minutes ? ` in ${minutes} minute${minutes === 1 ? "" : "s"}` : " later"}.`;
  }
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

/** Google's "G" mark, as its sign-in branding asks; a brand mark, not an interface icon. */
function GoogleMark() {
  return (
    <svg className="account-google-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Accounts plan: the sign-in dialog, after the owner's linewatchto dialog (2026-11-17). It opens on
 * a choice (Google, email, the demo account); email leads to the password form. A footer band
 * switches between signing in and creating an account. Only the ways this server offers are shown.
 */
export function SignInDialog() {
  const {
    signInOpen, signInReason, closeSignIn, signIn, signInDemo, signUp, forgotPassword,
    options, loadOptions, googleHref,
  } = useAccount();
  const [mode, setMode] = useState<Mode>("choice");
  const [intent, setIntent] = useState<Intent>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();

  useEffect(() => {
    if (signInOpen && !options) void loadOptions();
  }, [signInOpen, options, loadOptions]);

  const go = (next: Mode, nextIntent: Intent = intent) => {
    setMode(next);
    setIntent(nextIntent);
    setError(null);
    setPassword("");
  };

  const close = () => {
    go("choice", "sign-in");
    closeSignIn();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy("form");
    setError(null);
    // Clear the field before the request: on success the dialog's exit animation keeps a frozen
    // copy of the form, so clearing afterwards would leave the password in the DOM until it ends.
    const secret = password;
    setPassword("");
    try {
      if (mode === "forgot") {
        setSent(await forgotPassword(email.trim()));
        setMode("sent");
      } else if (intent === "sign-up") {
        setSent(await signUp(email.trim(), secret, name.trim() || undefined));
        setMode("sent");
      } else {
        await signIn(email.trim(), secret);
      }
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

  const google = () => {
    if (busy) return;
    setBusy("google");
    window.location.assign(googleHref());
  };

  const signUpOn = options?.sign_up ?? false;
  const signingUp = intent === "sign-up";
  const description = mode === "sent" ? undefined
    : mode === "forgot" ? "We'll email you a link to choose a new password."
    : signingUp ? "Create a free account to save favourite players and ask CourtLens questions."
    : signInReason ?? "Sign in to keep your favourite players and ask CourtLens questions.";
  const needsPassword = mode === "email";
  const ready = email.trim() && (!needsPassword || password);
  const errorLine = error && <p className="account-error" role="alert">{error}</p>;

  return (
    <Modal isOpen={signInOpen} onClose={close} title={title(mode, intent)} className="account-dialog" description={description} prominentClose>
      <div key={`${mode}-${intent}`} className="account-view" data-account-view={mode}>
        {mode === "sent" ? (
          <>
            <p className="account-sent" role="status">{sent} We sent it to <strong>{email.trim()}</strong>.</p>
            <div className="account-wide">
              <Button variant="secondary" size="lg" onClick={() => go("email", "sign-in")}>Back to Sign In</Button>
            </div>
          </>
        ) : mode === "choice" ? (
          <>
            <div className="account-stack">
              {options?.google && (
                <>
                  <Button variant="provider" size="lg" loading={busy === "google"} disabled={busy !== null} onClick={google}>
                    {busy !== "google" && <GoogleMark />}
                    Continue with Google
                  </Button>
                  <div className="account-or" aria-hidden="true"><span>or</span></div>
                </>
              )}
              <Button variant="provider" size="lg" icon="mail" disabled={busy !== null} onClick={() => go("email")}>
                Continue with Email
              </Button>
              {!signingUp && options?.demo !== false && (
                <Button variant="secondary" size="lg" icon="user" loading={busy === "demo"} disabled={busy !== null} onClick={demo}>
                  Use the Demo Account
                </Button>
              )}
            </div>
            {errorLine}
            <p className="account-legal">
              By continuing you agree to the <IntentLink href="/terms" onClick={close}>Terms</IntentLink> and{" "}
              <IntentLink href="/privacy" onClick={close}>Privacy Policy</IntentLink>.
            </p>
            {signUpOn && (
              <div className="account-footer">
                <span>{signingUp ? "Already have an account?" : "Don't have an account?"}</span>
                <Button variant="link" size="sm" onClick={() => go("choice", signingUp ? "sign-in" : "sign-up")}>
                  {signingUp ? "Sign In" : "Sign Up"}
                </Button>
              </div>
            )}
          </>
        ) : (
          <form className="account-form" onSubmit={submit} noValidate>
            {mode === "email" && signingUp && (
              <Field label="Name" htmlFor={nameId} hint="Optional. Shown in the header.">
                <Input id={nameId} inputSize="lg" autoComplete="name" maxLength={80} value={name} onChange={event => setName(event.target.value)} disabled={busy !== null} />
              </Field>
            )}
            <Field label="Email" htmlFor={emailId}>
              <Input id={emailId} inputSize="lg" type="email" autoComplete={signingUp ? "email" : "username"} inputMode="email" required
                value={email} onChange={event => setEmail(event.target.value)} disabled={busy !== null} />
            </Field>
            {needsPassword && (
              <Field label="Password" htmlFor={passwordId} hint={signingUp ? "12 characters or more." : undefined}>
                <Input id={passwordId} inputSize="lg" type="password" autoComplete={signingUp ? "new-password" : "current-password"} required
                  minLength={signingUp ? 12 : undefined} maxLength={128}
                  value={password} onChange={event => setPassword(event.target.value)} disabled={busy !== null} />
              </Field>
            )}
            {mode === "email" && !signingUp && signUpOn && (
              <div className="account-links">
                <Button variant="link" size="sm" onClick={() => go("forgot")}>Forgot Password?</Button>
              </div>
            )}
            {errorLine}
            <div className="account-wide">
              <Button type="submit" variant="primary" size="lg" loading={busy === "form"} disabled={busy !== null || !ready}>
                {mode === "forgot" ? "Email Me a Link" : signingUp ? "Create Account" : "Sign In"}
              </Button>
            </div>
            <div className="account-links">
              {mode === "forgot"
                ? <Button variant="link" size="sm" onClick={() => go("email", "sign-in")}>Back to Sign In</Button>
                : <Button variant="link" size="sm" onClick={() => go("choice")}>Back to Options</Button>}
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
