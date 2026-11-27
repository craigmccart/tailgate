r"""
One command to render everything: finds Blender, checks the downloaded kits
and textures are present (fetching them if not), runs the Blender render
script headless, and optionally builds the style-gate mock-up.

Run from the repo root with the system Python 3:

  python tools/render/render_all.py                 render every asset
  python tools/render/render_all.py --quick         fast low-sample pass
  python tools/render/render_all.py --group props   one group only
  python tools/render/render_all.py --only desk,chair_desk
  python tools/render/render_all.py --style-gate    also compose docs/style-gate/building-c-office.png

Blender is looked for at BLENDER_EXE, then the Blender 5.2 install path, then
on PATH. The style gate step needs Pillow and numpy (pip install pillow numpy).
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DEFAULT_BLENDER = Path(r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")


def find_blender() -> Path:
    candidates = [os.environ.get("BLENDER_EXE"), str(DEFAULT_BLENDER), shutil.which("blender")]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    sys.exit("Blender not found. Set BLENDER_EXE to blender.exe or install Blender 5.2 in the default place.")


def sources_present() -> bool:
    cache = Path(os.environ.get("TAILGATE_RENDER_CACHE", HERE))
    kits = cache / "kits"
    textures = cache / "textures"
    import json

    sources = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))
    missing = [kit["slug"] for kit in sources["kenney_kits"] if not (kits / kit["slug"] / ".extracted").is_file()]
    missing += [tex["id"] for tex in sources["ambientcg_textures"] if not (textures / tex["id"] / ".extracted").is_file()]
    if missing:
        print("missing sources: " + ", ".join(missing))
    return not missing


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--group", default="all")
    parser.add_argument("--only", default="")
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--style-gate", action="store_true", help="compose the Building C office mock-up afterwards")
    parser.add_argument("--skip-render", action="store_true", help="only run the style gate composite")
    args = parser.parse_args()

    if not args.skip_render:
        if not sources_present():
            print("fetching sources first")
            fetched = subprocess.run([sys.executable, str(HERE / "fetch_sources.py")], cwd=REPO)
            if fetched.returncode != 0:
                return fetched.returncode
        blender = find_blender()
        command = [str(blender), "-b", "-P", str(HERE / "render_assets.py"), "--", "--group", args.group]
        if args.only:
            command += ["--only", args.only]
        if args.quick:
            command.append("--quick")
        print("running: " + " ".join(f'"{part}"' if " " in part else part for part in command))
        rendered = subprocess.run(command, cwd=REPO)
        if rendered.returncode != 0:
            print(f"Blender exited with {rendered.returncode}")
            return rendered.returncode

    if args.style_gate or args.skip_render:
        composed = subprocess.run([sys.executable, str(HERE / "compose_style_gate.py")], cwd=REPO)
        return composed.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
