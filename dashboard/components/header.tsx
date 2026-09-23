import Link from "next/link";
import { Brand } from "./brand";

const links = [
  ["Players", "/players"],
  ["Compare", "/compare"],
  ["Evaluation", "/evaluation"]
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
        <Link className="button button-small" href="/players">
          Find a player <span aria-hidden="true">→</span>
        </Link>
      </div>
    </header>
  );
}
