"""Expand installed SCOWL/Hunspell dictionaries into the game's static JS lexicon.

Usage: python scripts/build-wordlist.py PATH/TO/dict-en
The source directory must contain en_US/GB/CA/AU .dic and .aff files.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"D:\Extra Programs\LibreOffice\share\extensions\dict-en")
OUT = ROOT / "src" / "shared" / "words.js"


def parse_aff(path: Path):
    rules = {"PFX": {}, "SFX": {}}
    crosses = {"PFX": {}, "SFX": {}}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        parts = line.split()
        if not parts or parts[0] not in rules or len(parts) < 4:
            continue
        kind, flag = parts[:2]
        if len(parts) == 4 and parts[3].isdigit():
            crosses[kind][flag] = parts[2] == "Y"
        elif len(parts) >= 5:
            strip, add, condition = parts[2:5]
            rules[kind].setdefault(flag, []).append(("" if strip == "0" else strip,
                                                        "" if add == "0" else add.split("/")[0],
                                                        condition))
    return rules, crosses


def apply(word: str, kind: str, rule):
    strip, add, condition = rule
    try:
        if not re.search(("^" if kind == "PFX" else "") + condition + ("" if kind == "PFX" else "$"), word):
            return None
    except re.error:
        return None
    if kind == "PFX":
        return add + word[len(strip):] if word.startswith(strip) else None
    return word[:-len(strip)] + add if strip and word.endswith(strip) else (word + add if not strip else None)


def clean(word: str):
    return word if re.fullmatch(r"[a-z]{3,30}", word) else None


words = set()
for locale in ("en_US", "en_GB", "en_CA", "en_AU"):
    dic = SOURCE / f"{locale}.dic"
    aff = SOURCE / f"{locale}.aff"
    if not dic.is_file() or not aff.is_file():
        raise SystemExit(f"Missing {dic} or {aff}")
    rules, crosses = parse_aff(aff)
    for entry in dic.read_text(encoding="utf-8-sig").splitlines()[1:]:
        raw = entry.split()[0] if entry.strip() else ""
        base, _, flags = raw.partition("/")
        if "!" in flags or not clean(base):
            continue
        words.add(base)
        prefixes = []
        suffixes = []
        for flag in flags:
            for kind, output in (("PFX", prefixes), ("SFX", suffixes)):
                for rule in rules[kind].get(flag, []):
                    form = apply(base, kind, rule)
                    if form and clean(form):
                        words.add(form)
                        if crosses[kind].get(flag):
                            output.append((flag, form))
        for prefix_flag, prefixed in prefixes:
            for suffix_flag, _ in suffixes:
                if crosses["PFX"].get(prefix_flag) and crosses["SFX"].get(suffix_flag):
                    for rule in rules["SFX"].get(suffix_flag, []):
                        form = apply(prefixed, "SFX", rule)
                        if form and clean(form):
                            words.add(form)

OUT.write_text("// Generated from SCOWL-derived Hunspell dictionaries. See data/SCOWL-NOTICE.txt.\n"
               + "export const WORDS = new Set(`\n"
               + "\n".join(sorted(words))
               + "\n`.trim().split('\\n'));\n", encoding="utf-8")
print(f"Wrote {len(words):,} words to {OUT}")
