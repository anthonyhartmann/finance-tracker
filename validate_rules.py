#!/usr/bin/env python3
"""Validate .clinerules structure — run after every edit."""
import sys, os

path = os.path.expanduser("~/.cline/.clinerules")
with open(path) as f:
    lines = f.readlines()

sections = [i for i, l in enumerate(lines, 1) if l.startswith("## ")]
print(f"Sections: {len(sections)}")
for s in sections:
    print(f"  Line {s}: {lines[s-1].strip()}")

# Check for orphaned lines (text that should belong to a section but got separated)
if len(sections) < 5:
    print("WARNING: Less than 5 sections — rules may be truncated!")
    sys.exit(1)

print("✅ .clinerules looks intact")
