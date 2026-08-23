import Link from "next/link";
import { Brand } from "./brand";

export function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer-grid">
        <div>
          <Brand />
          <p>Decision support for fantasy basketball. Unofficial and not affiliated with the NBA.</p>
        </div>
        <div className="footer-links">
          <Link href="/methodology">Definitions</Link>
          <Link href="/data-status">Source health</Link>
          <a href="https://docs.balldontlie.io/" rel="noreferrer" target="_blank">
            Data provider
          </a>
        </div>
      </div>
    </footer>
  );
}
