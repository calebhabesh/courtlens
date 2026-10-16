/**
 * An empty player slot's stand-in (alignment row 3, 66, 78): a headshot-framed athlete with a
 * bald head, an angular jaw, a short thick neck and straight shoulders cropped low, in one
 * neutral grey so it suggests no one in particular. Decorative.
 */
export function PlayerSilhouette({ className = "" }: { className?: string }) {
  return <svg className={`player-silhouette ${className}`} viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
    <path d="M50 16C62 16 70 24 70 37L69.6 42C71.6 41.6 73 43.2 72.5 46C72 49.2 70.6 51.6 68.6 51.8C67.6 56.4 65.2 60 62.4 62L62.6 68L85 75.8C93 78.6 97.6 83.6 99 91L99.5 100H.5L1 91C2.4 83.6 7 78.6 15 75.8L37.4 68L37.6 62C34.8 60 32.4 56.4 31.4 51.8C29.4 51.6 28 49.2 27.5 46C27 43.2 28.4 41.6 30.4 42L30 37C30 24 38 16 50 16Z" />
  </svg>;
}
