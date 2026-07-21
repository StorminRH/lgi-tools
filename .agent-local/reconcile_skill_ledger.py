#!/usr/bin/env python3
"""Restamp the skill-reconciliation ledger after a deliberate policy re-review.

For each paired skill (or one named skill), recompute the digest of that skill's
declared policy deps and write it to
``skillReconciliation[<skill>].reconciledHash`` in the manifest. Run this only
after re-reviewing the affected skills against the changed policy docs — the
restamp is the human attestation the drift gate checks.

    python3 .agent-local/reconcile_skill_ledger.py            # every skill
    python3 .agent-local/reconcile_skill_ledger.py close-out  # one skill
"""

from __future__ import annotations

import json
from pathlib import Path
import sys

from check_agent_drift import ledger_digest


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / ".agent-local" / "policy-manifest.json"


def main() -> int:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    ledger = manifest.get("skillReconciliation", {})
    targets = sys.argv[1:] or list(ledger)
    for name in targets:
        entry = ledger.get(name)
        if not isinstance(entry, dict) or not entry.get("deps"):
            raise SystemExit(f"no reconciliation deps declared for skill {name!r}")
        entry["reconciledHash"] = ledger_digest(ROOT, entry["deps"])
        print(f"reconciled {name}")
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
