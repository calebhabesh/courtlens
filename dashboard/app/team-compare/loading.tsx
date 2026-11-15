import { SkelControl, SkelFilterBar, SkelHeader, SkelSegmented, SkelText } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

function TeamSide() {
  return <div className="tc-team">
    <div className="tc-team-art"><Skeleton className="ui-skel-fill" /></div>
    <SkelText size="xl" width={200} className="ui-skel-center" />
    <div className="tc-team-controls"><SkelControl width={60} size="xs" /><SkelControl width={89} /></div>
    <SkelText size="xs" width={64} className="ui-skel-center" />
  </div>;
}

/** One rotation row: value, name and photo on each side of the position label, as on the card. */
function RotationRow({ index }: { index: number }) {
  const side = (mirror: boolean) => <td><span className="ui-skel-rotation" data-mirror={mirror || undefined}>
    <SkelText size="lg" width={40} />
    <span className="ui-skel-identity"><SkelText size="sm" width={`${54 + (index * 13) % 30}%`} /><SkelText size="2xs" width={84} /></span>
    <Skeleton variant="circle" width={32} height={32} />
  </span></td>;
  return <tr>{side(false)}<td><SkelText size="2xs" width={12} className="ui-skel-center" /></td>{side(true)}</tr>;
}

/**
 * Team Comparison's loading state in its card: header, controls, both team sides around the series
 * line, the rotation options and rows.
 */
export default function Loading() {
  return (
    <div className="ui-page ui-page-compare" role="status" aria-busy="true" aria-label="Loading Team Comparison">
      <div className="tc-page" aria-hidden="true">
        <SkelHeader title={200} subtitle={255} />
        <div className="tc-console"><SkelFilterBar fields={[]} modes={[[100, 68], [76, 80]]} meta={[100, 108]} /></div>
        <div className="tc-column"><div className="tc-stack"><section className="tc-card">
          <div className="tc-teams">
            <TeamSide />
            <div className="tc-versus"><SkelText size="3xl" width={180} className="ui-skel-center" /><SkelText size="xs" width={16} className="ui-skel-center" /></div>
            <TeamSide />
          </div>
          <div className="tc-options"><SkelSegmented options={[56, 48, 48, 40, 40]} /><div className="tc-order"><SkelSegmented options={[72, 80]} /><SkelControl width={82} /></div></div>
          <table className="tc-rotations">
            <colgroup><col /><col className="tc-rank-col" /><col /></colgroup>
            <tbody>{Array.from({ length: 12 }, (_, index) => <RotationRow key={index} index={index} />)}</tbody>
          </table>
        </section></div></div>
      </div>
    </div>
  );
}
