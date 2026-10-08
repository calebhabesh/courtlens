#!/usr/bin/env python3
"""Calculate WCAG 2.1 contrast ratios for CourtLens design tokens."""


def srgb_to_lin(c: float) -> float:
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_str: str) -> float:
    hex_str = hex_str.lstrip("#")
    r, g, b = [int(hex_str[i : i + 2], 16) for i in (0, 2, 4)]
    return 0.2126 * srgb_to_lin(r) + 0.7152 * srgb_to_lin(g) + 0.0722 * srgb_to_lin(b)


def contrast(c1: str, c2: str) -> float:
    l1 = luminance(c1)
    l2 = luminance(c2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


surfaces = {
    "bg (#0c0d10)": "#0c0d10",
    "surface-1 (#121419)": "#121419",
    "surface-2 (#181b21)": "#181b21",
    "surface-3 (#1f232a)": "#1f232a",
}

texts = {
    "--color-text (#f2f3f5)": "#f2f3f5",
    "--color-text-secondary (#a9afb9)": "#a9afb9",
    "--color-text-tertiary (#7d838d)": "#7d838d",
    "--color-accent (#ffd166)": "#ffd166",
    "--color-positive (#60d394)": "#60d394",
    "--color-negative (#ff6b6b)": "#ff6b6b",
    "--color-info (#67aaf9)": "#67aaf9",
}


def main():
    print("# Measured Contrast Ratios (WCAG 2.1)")
    print()
    print(
        "| Text Token | Surface | Contrast Ratio | WCAG AA Normal (4.5:1) | WCAG AA Large (3:1) |"
    )
    print("| --- | --- | --- | --- | --- |")

    # On-accent on accent
    on_accent_cr = contrast("#0c0d10", "#ffd166")
    print(
        f"| `--color-on-accent (#0c0d10)` | `--color-accent (#ffd166)` | "
        f"{on_accent_cr:.2f}:1 | Pass | Pass |"
    )

    for tname, thex in texts.items():
        for sname, shex in surfaces.items():
            cr = contrast(thex, shex)
            normal_pass = "Pass" if cr >= 4.5 else "Fail"
            large_pass = "Pass" if cr >= 3.0 else "Fail"
            print(f"| `{tname}` | `{sname}` | {cr:.2f}:1 | {normal_pass} | {large_pass} |")


if __name__ == "__main__":
    main()
