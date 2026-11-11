"use client";

import { Button } from "../ui/kit";
import { useAccount } from "../../lib/account-context";

/** A server page's "Sign in" action: opens the shared sign-in dialog. */
export function SignInPrompt({ reason, size = "sm" }: { reason?: string; size?: "sm" | "md" }) {
  const { openSignIn } = useAccount();
  return <Button variant="primary" size={size} onClick={() => openSignIn(reason)}>Sign in</Button>;
}
