#!/usr/bin/env python3
"""Read stdin and print it as ONE GitHub error annotation (readable via the check-runs API).

Usage: annotate.py <title> <head|tail> <max_bytes>
  head: keep the beginning (use for patches)   tail: keep the end (use for logs)
"""
import sys

title, mode, limit = sys.argv[1], sys.argv[2], int(sys.argv[3])
data = sys.stdin.buffer.read()
if len(data) > limit:
    data = data[:limit] if mode == "head" else data[-limit:]
# GitHub shows at most ~4 KB per annotation message: with a 4th argument (chunk size in bytes)
# the text is split into numbered parts (cut at line ends) that can be re-joined in order.
chunk = int(sys.argv[4]) if len(sys.argv) > 4 else 0
text = data.decode("utf-8", errors="replace")


def esc(t: str) -> str:
    return t.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


if chunk <= 0:
    print(f"::error title={title}::{esc(text)}")
else:
    parts, cur = [], ""
    for line in text.splitlines(keepends=True):
        if cur and len((cur + line).encode()) > chunk:
            parts.append(cur)
            cur = ""
        cur += line
    if cur:
        parts.append(cur)
    for i, part in enumerate(parts, 1):
        print(f"::error title={title} [{i:02d}/{len(parts):02d}]::{esc(part)}")
