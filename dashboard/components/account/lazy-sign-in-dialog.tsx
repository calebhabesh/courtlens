"use client";

import dynamic from "next/dynamic";
import { useAccount } from "@/lib/account-context";
import { useOpenedOnce } from "@/lib/use-opened-once";

const SignInDialog = dynamic(() => import("./sign-in-dialog").then(mod => mod.SignInDialog), { loading: () => null });

/** The sign-in dialog, loaded the first time it opens (speed plan SP05), then kept mounted. */
export function LazySignInDialog() {
  const { signInOpen } = useAccount();
  return useOpenedOnce(signInOpen) ? <SignInDialog /> : null;
}
