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
text = data.decode("utf-8", errors="replace")
text = text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
print(f"::error title={title}::{text}")
