#!/usr/bin/env python3
"""
Apply mobile-responsive Tailwind class fixes across all page files.
Rules:
  1. "grid grid-cols-2 gap-" in stat cards (not inside Dialog/form) → "grid grid-cols-1 sm:grid-cols-2 gap-"
  2. "grid grid-cols-3 gap-" at top level → "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-"
  3. "grid grid-cols-4 gap-" at top level → "grid grid-cols-2 md:grid-cols-4 gap-"
  4. "flex gap-" on button rows → ensure flex-wrap
  5. Tables: add overflow-x-auto wrapper check
"""
import os
import re
import sys

pages_dir = "/home/ubuntu/smartpro-hub/client/src/pages"
changes = []

# Patterns to fix: (pattern, replacement, description)
FIXES = [
    # Stat card grids - 2 cols without breakpoint → 1 col mobile, 2 col sm
    (
        r'"grid grid-cols-2 gap-(\d+)"',
        r'"grid grid-cols-1 sm:grid-cols-2 gap-\1"',
        "2-col grid → responsive"
    ),
    # 3-col grids without breakpoint
    (
        r'"grid grid-cols-3 gap-(\d+)"',
        r'"grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-\1"',
        "3-col grid → responsive"
    ),
    # 4-col grids without breakpoint
    (
        r'"grid grid-cols-4 gap-(\d+)"',
        r'"grid grid-cols-2 md:grid-cols-4 gap-\1"',
        "4-col grid → responsive"
    ),
    # 5-col grids without breakpoint
    (
        r'"grid grid-cols-5 gap-(\d+)"',
        r'"grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-\1"',
        "5-col grid → responsive"
    ),
    # 6-col grids without breakpoint
    (
        r'"grid grid-cols-6 gap-(\d+)"',
        r'"grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-\1"',
        "6-col grid → responsive"
    ),
    # flex rows with gap that might overflow - add flex-wrap
    (
        r'"flex items-center gap-(\d+)"',
        r'"flex flex-wrap items-center gap-\1"',
        "flex row → flex-wrap"
    ),
    # Button groups
    (
        r'"flex gap-(\d+)"(?!.*flex-wrap)',
        r'"flex flex-wrap gap-\1"',
        "flex gap → flex-wrap"
    ),
]

# Files to skip (dialogs and form-heavy files where 2-col is intentional)
SKIP_PATTERNS = [
    "ComponentShowcase",
    "NotFound",
    "Home.tsx",
]

def should_skip(filename):
    return any(p in filename for p in SKIP_PATTERNS)

total_changes = 0

for filename in sorted(os.listdir(pages_dir)):
    if not filename.endswith(".tsx"):
        continue
    if should_skip(filename):
        continue
    
    filepath = os.path.join(pages_dir, filename)
    with open(filepath, "r") as f:
        content = f.read()
    
    original = content
    file_changes = 0
    
    for pattern, replacement, desc in FIXES:
        new_content = re.sub(pattern, replacement, content)
        if new_content != content:
            count = len(re.findall(pattern, content))
            file_changes += count
            content = new_content
    
    if content != original:
        with open(filepath, "w") as f:
            f.write(content)
        total_changes += file_changes
        changes.append(f"  {filename}: {file_changes} fixes")
        print(f"✓ {filename}: {file_changes} responsive fixes applied")

print(f"\nTotal: {total_changes} responsive fixes across {len(changes)} files")
if changes:
    for c in changes:
        pass  # already printed above
