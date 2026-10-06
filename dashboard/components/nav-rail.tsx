"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Brand } from "./brand";

const navSections = [
  {
    title: "Research",
    links: [
      { href: "/", label: "Overview", icon: "📊" },
      { href: "/players", label: "Players", icon: "⛹️" },
      { href: "/teams", label: "Teams", icon: "🏟️" },
      { href: "/compare", label: "Compare", icon: "⚖️" }
    ]
  },
  {
    title: "Forecasting",
    links: [
      { href: "/forecasts", label: "Points Forecasts", icon: "🎯" },
      { href: "/evaluation", label: "M6 Archive", icon: "📜" }
    ]
  },
  {
    title: "Workbench",
    links: [
      { href: "/data-status", label: "Data & Jobs", icon: "🔄" },
      { href: "/investigations", label: "Investigations", icon: "📁" },
      { href: "/methodology", label: "Definitions", icon: "📖" },
      { href: "/settings", label: "Settings", icon: "⚙️" }
    ]
  }
];

export function NavRail() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar with hamburger */}
      <div className="mobile-header">
        <Brand subtitle="Workbench" />
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Main navigation rail */}
      <aside className={`nav-rail ${mobileOpen ? "open" : ""}`} aria-label="Main Navigation">
        <div className="nav-rail-header">
          <Brand subtitle="Workbench" />
        </div>

        <nav className="nav-rail-body">
          {navSections.map((section) => (
            <div key={section.title} className="nav-section">
              <span className="nav-section-title">{section.title}</span>
              <ul className="nav-list">
                {section.links.map((link) => {
                  const isActive =
                    link.href === "/"
                      ? pathname === "/"
                      : pathname === link.href || pathname?.startsWith(`${link.href}/`);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className={`nav-link ${isActive ? "active" : ""}`}
                        onClick={() => setMobileOpen(false)}
                      >
                        <span className="nav-icon" aria-hidden="true">
                          {link.icon}
                        </span>
                        <span>{link.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="nav-rail-footer">
          <div className="system-pill">
            <span className="status-dot-active" aria-hidden="true" />
            <span className="system-label">Release: public</span>
          </div>
          <div className="version-info">CourtLens v0.2.0 · Local</div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
