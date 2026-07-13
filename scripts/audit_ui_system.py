#!/usr/bin/env python3
"""Generate the Session 3.8.2.8 UI-system audit evidence report.

Run from the repository root:

    python3 scripts/audit_ui_system.py

The script scans source files only and writes docs/UI_SYSTEM_AUDIT_3_8_2_8.md.
It is intentionally a small, standard-library audit utility: classifications
remain explicit below so a reviewer can see which families are proposed for
absorption, retention, or further investigation.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
GLOBALS = SRC / "app" / "globals.css"
OUTPUT = ROOT / "docs" / "UI_SYSTEM_AUDIT_3_8_2_8.md"

SOURCE_SUFFIXES = {".ts", ".tsx", ".css", ".mjs"}
CLASS_DEFINITION = re.compile(r"^\s*\.([A-Za-z_-][A-Za-z0-9_-]*)", re.MULTILINE)
RGBA = re.compile(r"rgba\([^\n)]+\)")
TRACKING = re.compile(r"tracking-\[([0-9.]+em)\]")
DURATION = re.compile(r"duration-(\d+|\[[^\]]+\])")
EASING = re.compile(r"ease-(linear|in-out|in|out|\[[^\]]+\])")
Z_INDEX = re.compile(r"(?<![\w-])z-(-?\d+|\[[^\]]+\])")
SHADOW = re.compile(r"(?<!drop-)shadow-\[([^\]]+)\]")
ICON_PAIR = re.compile(
    r"(?:size-\[(\d+)px\]|h-\[(\d+)px\]\s+w-\[\2px\]|w-\[(\d+)px\]\s+h-\[\3px\])"
)
INTERACTIVE = re.compile(r"<(button|a|summary|input|textarea)\b")
EXPLICIT_FOCUS = re.compile(r"focus-visible:")
UI_IMPORT = re.compile(r"@/components/ui/([A-Za-z0-9_-]+)")
RELATIVE_UI_IMPORT = re.compile(r"from\s+['\"]\./([A-Za-z0-9_-]+)['\"]")


FAMILY_RULES: tuple[tuple[str, str, str], ...] = (
    ("kbd", "absorb", "Replace keyboard-hint one-offs with Kbd."),
    ("ns-kbd", "absorb", "Replace keyboard-hint one-offs with Kbd."),
    ("sites", "justified exception", "Domain-specific sites filtering, cards, tables, and lightbox layout."),
    ("industry", "justified exception", "Domain-specific planner/job presentation; not a neutral primitive."),
    ("legal", "justified exception", "Long-form legal document typography and layout."),
    ("contact", "justified exception", "Contact-page-only identity and address layout."),
    ("changelog", "justified exception", "Parsed changelog document/timeline presentation."),
    ("nav", "justified exception", "Application navigation shell and responsive menu layout."),
    ("app-header", "justified exception", "Application header shell and responsive layout."),
    ("account-menu", "justified exception", "Application account-menu composition."),
    ("run-as-menu", "justified exception", "Admin run-as menu composition."),
    ("status", "justified exception", "Live server-status vocabulary and animation."),
    ("skeleton-shimmer", "primitive", "Shared Skeleton motion, including the reduced-motion fallback."),
    ("server-status-slot", "justified exception", "Header slot that reserves server-status layout space."),
    ("flow", "delete", "No source consumer remains; remove the retired graph animation and node selectors."),
    ("tool-tile", "justified exception", "Home tool catalogue tile behavior."),
    ("content-browser", "justified exception", "Shared document-browser layout already owned by a primitive."),
    ("devlog", "protected", "Part B owns devlog presentation; excluded from this session."),
    ("sparkline-tooltip", "protected", "Chart CSSOM tooltip; Part D owns chart behavior."),
    ("price-confidence", "justified exception", "Feature-specific confidence indicator states."),
    ("price-flash", "justified exception", "Live-price update animation with reduced-motion fallback."),
    ("type-icon", "justified exception", "EVE image fallback and icon sizing."),
    ("page-backdrop", "justified exception", "Global application backdrop."),
    ("hero-wordmark", "justified exception", "Home hero display treatment."),
    ("hover-bob", "justified exception", "Opt-in home-card motion with reduced-motion fallback."),
    ("progress-fill", "justified exception", "Runtime width is supplied through CSSOM."),
    ("field-own-focus", "justified exception", "Prevents the global ring from doubling field focus borders."),
    ("body-copy", "justified exception", "Shared prose measure helper."),
    ("print-only", "justified exception", "Print-mode visibility utility."),
    ("no-print", "justified exception", "Print-mode visibility utility."),
)


def source_files() -> list[Path]:
    return sorted(
        path
        for path in SRC.rglob("*")
        if path.is_file() and path.suffix in SOURCE_SUFFIXES
    )


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def token_layer_end(css: str) -> int:
    start = css.find("@theme")
    if start < 0:
        return 0
    brace = css.find("{", start)
    depth = 0
    for index in range(brace, len(css)):
        if css[index] == "{":
            depth += 1
        elif css[index] == "}":
            depth -= 1
            if depth == 0:
                return index + 1
    raise RuntimeError("Unclosed @theme block in globals.css")


def line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def classify(css_class: str) -> tuple[str, str]:
    for prefix, disposition, reason in FAMILY_RULES:
        if css_class == prefix or css_class.startswith(f"{prefix}-"):
            return disposition, reason
    return "needs review", "No explicit family ruling yet; confirm consumer and ownership."


def family_name(css_class: str) -> str:
    for prefix, _, _ in FAMILY_RULES:
        if css_class == prefix or css_class.startswith(f"{prefix}-"):
            return prefix
    return css_class


def occurrences(texts: dict[Path, str], pattern: re.Pattern[str]) -> Counter[str]:
    values: Counter[str] = Counter()
    for text in texts.values():
        values.update(pattern.findall(text))
    return values


def table_counts(values: Counter[str]) -> list[str]:
    if not values:
        return ["| _none_ | 0 |"]
    return [f"| `{value}` | {count} |" for value, count in values.most_common()]


def main() -> None:
    files = source_files()
    texts = {path: path.read_text(encoding="utf-8") for path in files}
    globals_css = texts[GLOBALS]

    css_classes = sorted(set(CLASS_DEFINITION.findall(globals_css)))
    family_members: dict[str, list[str]] = {}
    for css_class in css_classes:
        family_members.setdefault(family_name(css_class), []).append(css_class)

    tsx_text = "\n".join(text for path, text in texts.items() if path.suffix in {".ts", ".tsx"})
    family_rows: list[str] = []
    for family, members in sorted(family_members.items()):
        disposition, reason = classify(members[0])
        consumer_count = sum(tsx_text.count(member) for member in members)
        sample = ", ".join(f"`.{member}`" for member in members[:4])
        if len(members) > 4:
            sample += f", +{len(members) - 4}"
        family_rows.append(
            f"| `{family}` | {sample} | {consumer_count} | {disposition} | {reason} |"
        )
    if "flow" not in family_members:
        family_rows.append(
            "| `flow` | _retired family_ | 0 | deleted | No source consumer remained; grep evidence is the family's absence from globals.css and source. |"
        )

    rgba_rows: list[str] = []
    theme_end = token_layer_end(globals_css)
    for path, text in texts.items():
        scan_start = theme_end if path == GLOBALS else 0
        for match in RGBA.finditer(text, scan_start):
            rgba_rows.append(
                f"| `{relative(path)}:{line_number(text, match.start())}` | `{match.group(0)}` | tokenize |"
            )

    ui_imports: Counter[str] = Counter()
    for text in texts.values():
        ui_imports.update(UI_IMPORT.findall(text))
        ui_imports.update(RELATIVE_UI_IMPORT.findall(text))
    ui_files = sorted((SRC / "components" / "ui").glob("*.tsx"))
    zero_consumer_rows = [
        f"| `{relative(path)}` | {ui_imports[path.stem]} | investigate |"
        for path in ui_files
        if ui_imports[path.stem] == 0
    ]

    interactive_count = sum(len(INTERACTIVE.findall(text)) for text in texts.values())
    explicit_focus_count = sum(len(EXPLICIT_FOCUS.findall(text)) for text in texts.values())

    report = [
        "# UI System Audit — 3.8.2.8",
        "",
        "> Generated by `python3 scripts/audit_ui_system.py` using only the Python standard library.",
        "> Re-run after implementation to refresh counts and deletion evidence.",
        "",
        "## Final findings table",
        "",
        "| Family | Representative selectors | Source mentions | Disposition | Rationale |",
        "|---|---|---:|---|---|",
        *family_rows,
        "",
        "A zero mention is not deletion authority by itself: dynamic class construction must be ruled out before deletion.",
        "",
        "## Raw rgba inventory outside the token layer",
        "",
        "Initial call-site count: **23**. Current call-site count: "
        f"**{len(rgba_rows)}**.",
        "",
        "| Location | Value | Proposed disposition |",
        "|---|---|---|",
        *(rgba_rows or ["| _none_ | — | complete |"]),
        "",
        "The lint rule rejects raw `rgba(` in source call sites while keeping `@theme` as the sanctioned token home.",
        "",
        "## Micro-value inventories",
        "",
        "### Tracking",
        "",
        "| Value | Count |",
        "|---|---:|",
        *table_counts(occurrences(texts, TRACKING)),
        "",
        "### Motion duration",
        "",
        "| Value | Count |",
        "|---|---:|",
        *table_counts(occurrences(texts, DURATION)),
        "",
        "### Motion easing",
        "",
        "| Value | Count |",
        "|---|---:|",
        *table_counts(occurrences(texts, EASING)),
        "",
        "### Z-index",
        "",
        "| Value | Count |",
        "|---|---:|",
        *table_counts(occurrences(texts, Z_INDEX)),
        "",
        "### Arbitrary shadows",
        "",
        "| Value | Count |",
        "|---|---:|",
        *table_counts(occurrences(texts, SHADOW)),
        "",
        "### Added token scales",
        "",
        "- Tracking: `copy 0.04em`, `ui 0.06em`, `label 0.08em`, `control 0.1em`, `wide 0.12em`, `emphasis 0.14em`, `display 0.16em`, `eyebrow 0.18em`.",
        "- Motion: `fast 150ms`, `panel 200ms`, and `panel cubic-bezier(0.2,0.85,0.25,1)` easing.",
        "- Stacking: `base 0`, `sticky 10`, `dropdown 40`, `overlay 50`.",
        "- Icon spacing: `xs 12px`, `sm 14px`, `md 18px`, `lg 22px`.",
        "- Elevation: named popover, toast, info/warn status, home-live, orange/blue dot, and selected-rail shadows.",
        "",
        "## Focus-visible audit seed",
        "",
        f"- Raw interactive elements found: **{interactive_count}**.",
        f"- Explicit `focus-visible:` utilities found: **{explicit_focus_count}**.",
        "- The global focus ring covers ordinary native controls. Review targets are controls that suppress outlines, use custom wells, or rely on popup state styling.",
        "- Final evidence must include keyboard traversal on every changed production route and the primitive reference route.",
        "",
        "## UI modules with no imports outside ui/",
        "",
        "| Module | Import count | Disposition |",
        "|---|---:|---|",
        *(zero_consumer_rows or ["| _none_ | 0 | — |"]),
        "",
        "These are investigation candidates, not deletion approvals; dynamic imports and same-folder composition must be checked first.",
        "",
        "## Primitive API sketches — blocking review gate",
        "",
        "| Primitive | Proposed public props | Production migration |",
        "|---|---|---|",
        "| `Field` | `label`, `hint?`, `error?`, `invalid?`, `disabled?`, `children` | Wrap FeedbackModal and CustomStructureBuilder textareas. |",
        "| `Checkbox` | existing controlled props + `disabled`, red tone | Replace AccountDangerZone native checkbox; preserve current acknowledgment behavior. |",
        "| `RadioGroup` | `label`, `options`, controlled/default value, `onValueChange`, `name?`, `disabled?` | Reference page only. |",
        "| `SegmentedControl` | option objects, `value`, `label`, button callback or link href | Replace existing Segmented API and admin RangeSelector without changing `?range=` links. |",
        "| `Tabs` | `tabs`, controlled/default value, `onValueChange?`, `label` | Reference page only. |",
        "| `Tooltip` | `content`, trigger `children`, placement and disabled options | Supplemental hover/focus text only; touch-critical `(?)` help remains Popover. |",
        "| `Kbd` | semantic `children`, `className?` | Replace GlobalSearch and compatible keyboard-hint one-offs. |",
        "| `CopyButton` | `value`, `displayValue?`, labels, `className?` | Reference page only; visible no-clipboard fallback. |",
        "| `Skeleton` | shape variant, `className?`, accessible label | Replace admin SectionFallback and approved shape-known fallbacks. |",
        "| `Banner` | `tone`, content, optional dismiss callback | Reference page only; no status integration. |",
        "| `Pagination` | page/count/total/page-size with link or callback navigation | Reference page only. |",
        "| `ConfirmDialog` | controlled open, title/consequence, busy/error, confirm/cancel actions, optional body | Extract all AccountDangerZone confirmation shells; preserve behavior. |",
        "",
        "## Admin reference index",
        "",
        "`/preview/primitives` is server-authorized with the existing admin session check and rendered as a static shell with a request-time Suspense hole. Its ten demo groups visibly exercise all twelve primitives, including interactive checked/selected/tab states, clipboard fallback, dismissible and warning banners, pagination, reduced-motion skeleton styling, and the destructive-confirmation shell.",
        "",
        "## Production migration evidence",
        "",
        "- Field: FeedbackModal and CustomStructureBuilder now wrap their existing Textarea controls with shared labels, hints, and errors.",
        "- Checkbox and ConfirmDialog: all AccountDangerZone gates use the shared shell; permanent deletion retains its acknowledgement checkbox and disabled-confirm behavior.",
        "- SegmentedControl: admin range links retain `?range=` navigation; settings, page menu, multibuy, and sites view/detail controls share the same primitive.",
        "- Kbd: GlobalSearch and IndustryTypedHint use the semantic shortcut cap.",
        "- Skeleton: the admin section fallback uses shape-known rows, and the gated reference Suspense boundary has a labelled placeholder.",
        "- The lint guard is active in the zero-warning `pnpm lint` command and keeps the existing type-size, radius, native-select, ad-hoc field, raw-hex, and raw-HTML protections alongside raw rgba.",
        "",
        "## Decisions already resolved",
        "",
        "- The primitive reference remains a dedicated page, but the page is gated by the existing admin session check rather than added as an admin-dashboard tab.",
        "- The session ends with a current-head Greptile 5/5 and no findings on an open PR. It must not merge.",
        "- Chart components and devlog presentation are protected from this sweep.",
        "",
    ]

    OUTPUT.write_text("\n".join(report), encoding="utf-8")
    print(f"wrote {relative(OUTPUT)}")
    print(f"css families: {len(family_members)}")
    print(f"raw rgba outside token layer: {len(rgba_rows)}")
    print(f"zero-import ui candidates: {len(zero_consumer_rows)}")


if __name__ == "__main__":
    main()
