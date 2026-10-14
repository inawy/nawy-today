#!/usr/bin/env python3
"""Golden fixtures for the recurrence engine (D-021).

The independent reference is python-dateutil (pinned in requirements.txt). Every case is a
rule + DTSTART + query window, and the expected occurrences inside that window.

  python tools/recurrence/gen_fixtures.py          write tests/fixtures/recurrence-golden.json
  python tools/recurrence/gen_fixtures.py --check  fail if the committed file is not reproducible

Date model (matches D-005): a fixture works on wall-clock civil values only. An all-day case has
a `YYYY-MM-DD` start and results; a timed case has `YYYY-MM-DDTHH:mm` and results. Time zones and
DST are deliberately NOT part of the engine's job (they are applied afterwards by core/time).

Categories:
  normal         must match exactly (mandatory criterion of D-021)
  contested      DTSTART does not itself match the rule. RFC 5545 readers disagree on whether it
                 still counts; our rule is "it counts only if it matches" (= dateutil). Shown in
                 the comparison but not counted toward the mandatory criterion.
  never-matching the rule can never produce an occurrence (e.g. 30 February): the engine must
                 TERMINATE and return an empty list.

EXDATE is intentionally absent: it is a set difference applied by the caller, not an engine
feature (Phase 3c).
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from dateutil.rrule import rrulestr

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "fixtures" / "recurrence-golden.json"

MAX_RESULTS = 400

# (rule, window-length in days, never-matching?)
# `{U}` is replaced by an UNTIL value that suits the DTSTART kind.
RULES: list[tuple[str, int, bool]] = [
    # daily
    ("FREQ=DAILY", 120, False),
    ("FREQ=DAILY;INTERVAL=3", 240, False),
    ("FREQ=DAILY;INTERVAL=10;COUNT=7", 400, False),
    ("FREQ=DAILY;COUNT=40", 400, False),
    ("FREQ=DAILY;UNTIL={U}", 800, False),
    # weekly
    ("FREQ=WEEKLY", 730, False),
    ("FREQ=WEEKLY;BYDAY=MO,WE,FR", 365, False),
    ("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO,TU,SA", 730, False),
    ("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=SU", 730, False),
    ("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=MO", 730, False),
    ("FREQ=WEEKLY;INTERVAL=3;BYDAY=SA,SU;WKST=SA", 730, False),
    ("FREQ=WEEKLY;BYDAY=TH;COUNT=10", 730, False),
    ("FREQ=WEEKLY;BYDAY=MO,FR;UNTIL={U}", 1500, False),
    # monthly
    ("FREQ=MONTHLY", 1900, False),
    ("FREQ=MONTHLY;INTERVAL=2", 1900, False),
    ("FREQ=MONTHLY;BYMONTHDAY=1,15", 1100, False),
    ("FREQ=MONTHLY;BYMONTHDAY=-1", 1100, False),
    ("FREQ=MONTHLY;BYMONTHDAY=-2,-1,1", 1100, False),
    ("FREQ=MONTHLY;BYMONTHDAY=29,30,31", 1100, False),
    ("FREQ=MONTHLY;BYMONTHDAY=31", 1900, False),
    ("FREQ=MONTHLY;BYDAY=1MO", 1100, False),
    ("FREQ=MONTHLY;BYDAY=-1FR", 1100, False),
    ("FREQ=MONTHLY;BYDAY=2TU,4TU", 1100, False),
    ("FREQ=MONTHLY;BYDAY=5SU", 1900, False),
    ("FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR", 120, False),
    ("FREQ=MONTHLY;INTERVAL=3;BYDAY=-1SA", 1900, False),
    ("FREQ=MONTHLY;INTERVAL=12;BYMONTHDAY=13", 4000, False),
    ("FREQ=MONTHLY;BYMONTHDAY=15;COUNT=6", 1100, False),
    ("FREQ=MONTHLY;BYDAY=1MO;UNTIL={U}", 1900, False),
    ("FREQ=MONTHLY;BYMONTH=3,9;BYMONTHDAY=1", 1900, False),
    # yearly
    ("FREQ=YEARLY", 4000, False),
    ("FREQ=YEARLY;INTERVAL=4", 9000, False),
    ("FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", 4000, False),
    ("FREQ=YEARLY;BYMONTH=11;BYDAY=1TU", 4000, False),
    ("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29", 9000, False),
    ("FREQ=YEARLY;BYMONTH=1,7;BYMONTHDAY=1", 4000, False),
    ("FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=-1", 4000, False),
    ("FREQ=YEARLY;BYMONTH=5;BYDAY=MO,TU,WE,TH,FR;COUNT=12", 4000, False),
    ("FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=15;UNTIL={U}", 4000, False),
    # never matching (must terminate, return nothing)
    ("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30", 9000, True),
    ("FREQ=YEARLY;BYMONTH=4;BYMONTHDAY=31", 9000, True),
    ("FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=31", 9000, True),
    ("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-30", 9000, True),
]

# DTSTART variants. Tuesday 2026-10-13 is the app's "today" in the tests.
STARTS = [
    "2026-10-13",  # ordinary all-day
    "2024-01-31",  # day 31, leap year
    "2024-02-29",  # leap day
    "2025-12-31",  # year boundary
    "2000-01-01",  # far in the past; far windows test window jumping
    "2026-10-13T09:30",  # timed
    "2025-03-30T23:45",  # timed, late evening, around a DST change in many zones
]


def parse_start(s: str) -> datetime:
    return datetime.fromisoformat(s)


def fmt(dt: datetime, all_day: bool) -> str:
    return dt.strftime("%Y-%m-%d") if all_day else dt.strftime("%Y-%m-%dT%H:%M")


def until_for(start: datetime, all_day: bool) -> str:
    end = (start + timedelta(days=500)).date()
    if all_day:
        return end.strftime("%Y%m%d")
    return end.strftime("%Y%m%dT235959")  # floating (no Z), D-021


def occurrences(rule_text: str, start: datetime, lo: datetime, hi: datetime) -> list[datetime]:
    rule = rrulestr(rule_text, dtstart=start)
    out: list[datetime] = []
    for occ in rule.between(lo, hi, inc=True):
        if occ < hi:
            out.append(occ)
        if len(out) >= MAX_RESULTS:
            break
    return out


def make_cases(start_text: str, rule_tpl: str, span: int, never: bool, cases: list[dict]) -> None:
    all_day = "T" not in start_text
    start = parse_start(start_text)
    rule_text = rule_tpl.replace("{U}", until_for(start, all_day))
    first = list(rrulestr(rule_text, dtstart=start)[:1]) if not never else [start]
    category = "never-matching" if never else ("normal" if first and first[0] == start else "contested")
    # Two windows per case: right at DTSTART, and 20 years later (window jumping).
    for label in ("near", "far"):
        if never and label == "far":
            continue
        lo = start if label == "near" else start.replace(year=start.year + 20, day=1)
        if all_day:
            lo = datetime(lo.year, lo.month, lo.day)
        hi = lo + timedelta(days=span)
        occ = occurrences(rule_text, start, lo, hi)
        cases.append(
            {
                "id": f"{len(cases):04d}",
                "category": category,
                "rule": rule_text,
                "dtstart": start_text,
                "window": {"from": fmt(lo, all_day), "to": fmt(hi, all_day)},
                "expected": [fmt(o, all_day) for o in occ],
            }
        )


def build() -> dict:
    cases: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for start_text in STARTS:
        all_day = "T" not in start_text
        start = parse_start(start_text)
        for rule_tpl, span, never in RULES:
            variants = [start_text]
            if not never:
                # A "synced" twin: DTSTART moved to the rule's first real occurrence, so the
                # mandatory (non-contested) set also covers rules whose BYDAY/BYMONTH... would
                # not match the raw start.
                rule_text = rule_tpl.replace("{U}", until_for(start, all_day))
                first = list(rrulestr(rule_text, dtstart=start)[:1])
                if first and first[0] != start:
                    variants.append(fmt(first[0], all_day))
            for v in variants:
                key = (rule_tpl.replace("{U}", until_for(parse_start(v), "T" not in v)), v)
                if key in seen:
                    continue
                seen.add(key)
                make_cases(v, rule_tpl, span, never, cases)
    return {
        "generator": "tools/recurrence/gen_fixtures.py",
        "reference": "python-dateutil 2.9.0.post0",
        "windowSemantics": "occurrences o with from <= o < to, ascending, at most 400",
        "cases": cases,
    }


def render() -> str:
    return json.dumps(build(), ensure_ascii=False, indent=1, sort_keys=False) + "\n"


def main() -> int:
    text = render()
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print("recurrence-golden.json is not reproducible from gen_fixtures.py", file=sys.stderr)
            return 1
        print("fixtures reproducible")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    data = json.loads(text)
    counts: dict[str, int] = {}
    for c in data["cases"]:
        counts[c["category"]] = counts.get(c["category"], 0) + 1
    print(f"wrote {len(data['cases'])} cases {counts} -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
