import { IntentLink } from "@/components/intent-link";
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
          <IntentLink href="/methodology">Definitions</IntentLink>
          <IntentLink href="/data-status">Source health</IntentLink>
          <IntentLink href="/players">Historical players</IntentLink>
        </div>
      </div>
    </footer>
  );
}
