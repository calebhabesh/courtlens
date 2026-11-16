// Test fixture for use-opened-once.test.tsx: an overlay that renders a dialog only while open.
export function FixtureOverlay({ isOpen }: { isOpen: boolean }) {
  return isOpen ? <div role="dialog">overlay</div> : <span data-testid="overlay-closed" />;
}
