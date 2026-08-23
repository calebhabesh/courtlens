import Link from "next/link";
import { Brand } from "./brand";

const links = [
  ["Planner", "/planner"],
  ["Schedule", "/schedule"],
  ["Players", "/players"],
  ["Methodology", "/methodology"],
  ["Data status", "/data-status"]
];

export function Header() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Brand />
        <nav aria-label="Primary navigation">
          {links.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <Link className="button button-small" href="/planner">
          Open planner <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </header>
  );
}
