r"""
Tailgate render pipeline, Blender entry point.

Renders every asset listed in tools/render/assets.json straight down from an
orthographic camera, twice each (colour with alpha, and a tangent-space
normal map), into public/assets/rendered/, and writes the manifest there.

Run it through Blender, headless, from the repo root:

  "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P tools/render/render_assets.py -- [options]

or let tools/render/render_all.py find Blender and call this for you.

Options after the double dash:

  --group props,floors,walls,primitives,characters   render only these groups
  --only desk,chair_desk                             render only these asset ids
  --quick                                            low sample counts for a fast look
  --list                                             print the catalogue and exit

A partial run merges into the existing manifest; a full run rebuilds it.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from tailgate_render import config, manifest  # noqa: E402
from tailgate_render.jobs import GROUPS, run_group  # noqa: E402


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="render_assets.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--group", default="all", help="comma list of groups, or all")
    parser.add_argument("--only", default="", help="comma list of asset ids")
    parser.add_argument("--quick", action="store_true", help="low sample counts")
    parser.add_argument("--list", action="store_true", help="print the catalogue and exit")
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    catalogue = json.loads(config.ASSETS_JSON.read_text(encoding="utf-8"))
    groups = list(GROUPS) if args.group == "all" else [g.strip() for g in args.group.split(",") if g.strip()]
    only = {s.strip() for s in args.only.split(",") if s.strip()}

    if args.list:
        for group in groups:
            for item in catalogue.get(group, []):
                print(f"{group:11s} {item['id']}")
        return 0

    unknown = [g for g in groups if g not in GROUPS]
    if unknown:
        print(f"unknown group(s): {unknown}; choose from {list(GROUPS)}")
        return 2

    partial = bool(only) or args.group != "all"
    quality = {
        "colour_samples": config.QUICK_COLOUR_SAMPLES if args.quick else config.COLOUR_SAMPLES,
        "normal_samples": config.QUICK_NORMAL_SAMPLES if args.quick else config.NORMAL_SAMPLES,
    }
    started = time.time()
    entries: list[dict] = []
    red_hits: list[str] = []
    for group in groups:
        items = [item for item in catalogue.get(group, []) if not only or item["id"] in only]
        if not items:
            continue
        print(f"\n=== {group}: {len(items)} item(s) ===")
        for entry in run_group(group, items, quality):
            entries.append(entry)
            for key in ("file", "normal"):
                if key in entry:
                    hits = manifest.check_no_alarm_red(config.OUTPUT_DIR / entry[key])
                    if hits:
                        red_hits.append(f"{entry[key]}: {hits} px")
    manifest.write(entries, merge=partial)
    print(f"\n[done] {len(entries)} asset(s) in {time.time() - started:.0f}s")
    if red_hits:
        print("[FAIL] alarm red #FF3B30 found in rendered output, which the art rules forbid:")
        for hit in red_hits:
            print("   " + hit)
        return 1
    return 0


if __name__ == "__main__":
    code = main()
    sys.exit(code)
