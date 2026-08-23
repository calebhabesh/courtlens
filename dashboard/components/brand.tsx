import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="CourtLoad home">
      <span className="brand-mark" aria-hidden="true">
        <span />
      </span>
      <span>COURTLOAD</span>
    </Link>
  );
}
