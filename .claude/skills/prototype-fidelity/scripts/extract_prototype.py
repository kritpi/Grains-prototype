#!/usr/bin/env python3
"""Make docs/design/grains-prototype.html readable.

The prototype is an exported artifact: its real markup lives inside a JavaScript
string literal, with forward slashes written as \\u002F and newlines as \\n. Any
tool that treats it as HTML — grep, an HTML parser, a browser's view-source —
gets 780 KB of escaped noise and finds nothing useful. That is the whole reason
the implementation drifted from it: the spec was there and was unreadable, so it
got skipped in favour of documents that opened cleanly.

This unescapes it once and then lets you search it like ordinary markup.

    # one-time: write the readable copy (defaults under .prototype-cache/)
    python3 extract_prototype.py

    # the design tokens: :root plus every state-driven rule
    python3 extract_prototype.py --tokens

    # the markup around a screen, by any text you can see in it
    python3 extract_prototype.py --find "PRICING PER PROCESS" --before 400 --after 6000

    # what screens exist
    python3 extract_prototype.py --screens

Run it from the repository root, or pass --prototype.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

DEFAULT_PROTOTYPE = "docs/design/grains-prototype.html"
DEFAULT_CACHE = ".prototype-cache/prototype.html"


def unescape_js_string(body: str) -> str:
    """Turn a JavaScript string literal's contents back into text."""
    out = (
        body.replace("\\u002F", "/")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
        .replace('\\"', '"')
        .replace("\\'", "'")
    )
    out = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), out)
    # Do backslashes last, so the escapes above are not eaten early.
    return out.replace("\\\\", "\\")


def extract(prototype_path: str) -> str:
    src = open(prototype_path, encoding="utf-8").read()

    start = src.find('"<!DOCTYPE html>')
    if start == -1:
        # Already plain HTML — some exports are. Nothing to do.
        if "<!DOCTYPE html>" in src or "<html" in src:
            return src
        raise SystemExit(
            f"{prototype_path}: no embedded document found. If the export format "
            "changed, open the file and look for where the markup starts."
        )

    tail = src[start + 1 :]

    # Walk to the closing quote, skipping escaped ones.
    i = 0
    while True:
        i = tail.find('"', i)
        if i == -1:
            break
        backslashes = 0
        j = i - 1
        while j >= 0 and tail[j] == "\\":
            backslashes += 1
            j -= 1
        if backslashes % 2 == 0:
            break
        i += 1

    return unescape_js_string(tail[:i] if i != -1 else tail)


def cmd_tokens(doc: str) -> None:
    css = "".join(re.findall(r"<style[^>]*>(.*?)</style>", doc, re.S))
    if not css:
        print("No <style> blocks found.", file=sys.stderr)
        return

    print("# :root tokens\n")
    for rule in re.findall(r":root\s*\{[^}]*\}", css):
        print(rule.strip(), "\n")

    print("# state-driven rules (the prototype expresses states as attributes)\n")
    seen = set()
    for rule in re.findall(r"\[data-[^\]]+\][^{]*\{[^}]*\}", css):
        if rule not in seen:
            seen.add(rule)
            print(rule.strip())

    print("\n# classes\n")
    for rule in re.findall(r"^\s*\.[a-zA-Z][\w-]*[^{]*\{[^}]*\}", css, re.M):
        print(rule.strip())


def cmd_screens(doc: str) -> None:
    """The prototype switches screens on a variable; list its options."""
    # The screen list is JSON inside an HTML attribute, so the quotes arrive
    # as &quot; — match both spellings rather than only the tidy one.
    patterns = [r'"options"\s*:\s*\[([^\]]+)\]', r'&quot;options&quot;\s*:\s*\[([^\]]+)\]']
    for pattern in patterns:
      for match in re.findall(pattern, doc):
        names = re.findall(r'(?:"|&quot;)([a-z][a-zA-Z0-9_-]*)(?:"|&quot;)', match)
        if len(names) > 2:
            print("screens:", ", ".join(names))
            return
    print(
        "No screen list found. Use --find with text you can see on the screen "
        "you want (for example a section heading).",
        file=sys.stderr,
    )


def cmd_find(doc: str, needle: str, before: int, after: int) -> None:
    index = doc.find(needle)
    if index == -1:
        # Case-insensitive second try, since headings are often shouted.
        lowered = doc.lower().find(needle.lower())
        if lowered == -1:
            raise SystemExit(f"{needle!r} not found in the prototype.")
        index = lowered

    print(doc[max(0, index - before) : index + after])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--prototype", default=DEFAULT_PROTOTYPE)
    parser.add_argument("--out", default=DEFAULT_CACHE)
    parser.add_argument("--tokens", action="store_true", help="print the design tokens and state rules")
    parser.add_argument("--screens", action="store_true", help="list the prototype's screens")
    parser.add_argument("--find", metavar="TEXT", help="print the markup around some visible text")
    parser.add_argument("--before", type=int, default=200)
    parser.add_argument("--after", type=int, default=4000)
    args = parser.parse_args()

    if not os.path.exists(args.prototype):
        raise SystemExit(f"{args.prototype} not found — run from the repository root or pass --prototype.")

    doc = extract(args.prototype)

    if args.tokens:
        cmd_tokens(doc)
        return
    if args.screens:
        cmd_screens(doc)
        return
    if args.find:
        cmd_find(doc, args.find, args.before, args.after)
        return

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        handle.write(doc)
    print(f"Wrote {args.out} ({len(doc) // 1024} KB of readable markup).")
    print("Open it in a browser beside your implementation, or grep it directly.")


if __name__ == "__main__":
    main()
