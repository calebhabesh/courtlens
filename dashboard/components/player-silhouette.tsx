/**
 * An empty player slot's stand-in (alignment row 3, 66): a headshot-sized, bald head and
 * shoulders in one neutral grey, so it suggests no one in particular. Decorative.
 */
export function PlayerSilhouette({ className = "" }: { className?: string }) {
  return <svg className={`player-silhouette ${className}`} viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
    <path d="M50 10C62 10 70 19 70 32c0 4 0 7-.5 9 2.5-1 4.5 1 4 5-.5 4-2.5 7-5 7-1.5 5-4.5 9-7.5 11.5V70c5 3 15 5 25 9 9 3 13 11 14 21H0c1-10 5-18 14-21 10-4 20-6 25-9v-5.5c-3-2.5-6-6.5-7.5-11.5-2.5 0-4.5-3-5-7-.5-4 1.5-6 4-5-.5-2-.5-5-.5-9C30 19 38 10 50 10z" />
  </svg>;
}
