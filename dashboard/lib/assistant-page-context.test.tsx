// @vitest-environment happy-dom
import { act, Suspense } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AssistantPageProvider, AssistantPageSelection, useAssistantPage } from "./assistant-page-context";

vi.mock("next/navigation", () => ({ usePathname: () => "/teams/100" }));

/** The header's Ask button: disabled until the page has registered its context. */
function AskButton() {
  const page = useAssistantPage();
  return <button type="button" disabled={!page} aria-haspopup={page ? "dialog" : undefined}>Ask</button>;
}

// The layout's shape since 2026-11-17: the header in its own Suspense boundary (hydrated after the
// shell), the page in the shell, registering its context from an effect.
const tree = <AssistantPageProvider>
  <Suspense fallback={null}><AskButton /></Suspense>
  <main><AssistantPageSelection route="/teams/100" label="Team" teamIds={["100"]} scope={{ season: "2025-26" }} /></main>
</AssistantPageProvider>;

it("hydrates the header against the server's value, then enables Ask", async () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(tree);
  document.body.appendChild(container);
  const button = container.querySelector("button")!;
  expect(button.disabled).toBe(true);
  const recoverable = vi.fn();
  await act(async () => { hydrateRoot(container, tree, { onRecoverableError: recoverable }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(recoverable).not.toHaveBeenCalled();
  // Same element (hydrated, not replaced), now enabled: an unpatched mismatch left it disabled.
  expect(container.querySelector("button")).toBe(button);
  expect(button.disabled).toBe(false);
  expect(button.getAttribute("aria-haspopup")).toBe("dialog");
});
