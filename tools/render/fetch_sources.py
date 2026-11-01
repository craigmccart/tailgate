r"""
Download every third-party source the Tailgate render pipeline needs.

Reads tools/render/sources.json, then:

  1. Asks kenney.nl for a fresh signed download link for each 3D kit and saves
     the zip. Kenney does not publish fixed zip URLs; the site hands out a
     short-lived link per request, which is what this script asks for.
  2. Downloads each ambientCG surface texture zip by its public id.
  3. Unzips every archive into its own folder so nothing from one pack can
     overwrite another, and writes sources.lock.json recording the URL, size
     and SHA-256 of every file it fetched. That lock file is the provenance
     trail behind the CREDITS.md lines.

Where things land (all gitignored by tools/render/.gitignore):

  tools/render/kits/<slug>/        one folder per Kenney kit
  tools/render/textures/<id>/      one folder per ambientCG texture

Set TAILGATE_RENDER_CACHE to put those two folders somewhere else, for
example on another drive. Already-downloaded archives whose size matches are
skipped, so re-running is cheap.

Run with the system Python 3 (no third-party packages needed):

  python tools/render/fetch_sources.py
  python tools/render/fetch_sources.py --only furniture-kit Carpet012

The script never executes anything it downloads. Zips are read with Python's
zipfile module and member paths are checked so an archive cannot write outside
its own folder.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCES = HERE / "sources.json"
LOCK = HERE / "sources.lock.json"
CACHE = Path(os.environ.get("TAILGATE_RENDER_CACHE", HERE))
KITS_DIR = CACHE / "kits"
TEXTURES_DIR = CACHE / "textures"
USER_AGENT = "Mozilla/5.0 (Tailgate render pipeline; github.com/craigmccart/tailgate)"


def http_get(url: str, referer: str | None = None, timeout: int = 120) -> bytes:
    headers = {"User-Agent": USER_AGENT}
    if referer:
        headers["Referer"] = referer
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def download(url: str, target: Path, referer: str | None = None) -> dict:
    """Stream a file to disk, returning its size and SHA-256."""
    target.parent.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": USER_AGENT}
    if referer:
        headers["Referer"] = referer
    request = urllib.request.Request(url, headers=headers)
    digest = hashlib.sha256()
    size = 0
    started = time.time()
    with urllib.request.urlopen(request, timeout=300) as response, target.open("wb") as out:
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
            digest.update(chunk)
            size += len(chunk)
    print(f"    {size / 1e6:6.1f} MB in {time.time() - started:4.1f}s")
    return {"bytes": size, "sha256": digest.hexdigest()}


def safe_extract(archive: Path, folder: Path) -> int:
    """Unzip, refusing any member that would land outside the folder."""
    folder.mkdir(parents=True, exist_ok=True)
    root = folder.resolve()
    count = 0
    with zipfile.ZipFile(archive) as zf:
        for member in zf.infolist():
            name = member.filename.replace("\\", "/")
            if name.startswith("/") or ".." in name.split("/"):
                raise RuntimeError(f"{archive.name}: refusing unsafe member {name!r}")
            destination = (root / name).resolve()
            if root != destination and root not in destination.parents:
                raise RuntimeError(f"{archive.name}: member escapes folder: {name!r}")
            if member.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member) as src, destination.open("wb") as dst:
                dst.write(src.read())
            count += 1
    return count


def kenney_signed_link(slug: str) -> str:
    """kenney.nl's download button fetches /download-link/<id>, where the id is
    printed on the asset page as data-download-id. It is the hex of the pack's
    internal path, which is not always the URL slug, so read it from the page."""
    page = f"https://kenney.nl/assets/{slug}"
    html = http_get(page).decode("utf-8", errors="replace")
    match = re.search(r"data-download-id='([0-9a-f]+)'", html)
    if not match:
        raise RuntimeError(f"no data-download-id on {page}; the site layout may have changed")
    download_id = match.group(1)
    payload = json.loads(http_get(f"https://kenney.nl/download-link/{download_id}", referer=page))
    url = payload.get("url")
    if not url:
        raise RuntimeError(f"kenney.nl gave no download url for {slug}: {payload!r}")
    return url


def fetch_kit(kit: dict, lock: dict, force: bool) -> None:
    slug = kit["slug"]
    folder = KITS_DIR / slug
    archive = KITS_DIR / f"kenney_{slug}.zip"
    marker = folder / ".extracted"
    if marker.exists() and not force:
        print(f"  {slug}: already present, skipping")
        return
    print(f"  {slug}: requesting signed link")
    url = kenney_signed_link(slug)
    info = download(url, archive, referer=kit["url"])
    count = safe_extract(archive, folder)
    marker.write_text(f"{count} files from {archive.name}\n", encoding="utf-8")
    lock["kenney_kits"][slug] = {
        "name": kit["name"],
        "page": kit["url"],
        "licence": kit["licence"],
        "archive": archive.name,
        "files": count,
        **info,
    }


def fetch_texture(texture: dict, meta: dict, lock: dict, force: bool) -> None:
    asset_id = texture["id"]
    resolution = texture.get("resolution", "1K-JPG")
    folder = TEXTURES_DIR / asset_id
    archive = TEXTURES_DIR / f"{asset_id}_{resolution}.zip"
    marker = folder / ".extracted"
    if marker.exists() and not force:
        print(f"  {asset_id}: already present, skipping")
        return
    url = meta["download_pattern"].format(id=asset_id, resolution=resolution)
    print(f"  {asset_id}: {url}")
    info = download(url, archive)
    count = safe_extract(archive, folder)
    marker.write_text(f"{count} files from {archive.name}\n", encoding="utf-8")
    lock["ambientcg_textures"][asset_id] = {
        "page": meta["page_pattern"].format(id=asset_id),
        "licence": meta["licence"],
        "resolution": resolution,
        "archive": archive.name,
        "files": count,
        **info,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", nargs="*", default=None, help="kit slugs or texture ids to fetch; default is everything")
    parser.add_argument("--force", action="store_true", help="re-download even if already extracted")
    args = parser.parse_args()

    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    lock = {"kenney_kits": {}, "ambientcg_textures": {}}
    if LOCK.exists():
        lock = json.loads(LOCK.read_text(encoding="utf-8"))
        lock.setdefault("kenney_kits", {})
        lock.setdefault("ambientcg_textures", {})

    wanted = set(args.only) if args.only else None
    failures: list[str] = []

    print(f"Kenney kits -> {KITS_DIR}")
    for kit in sources["kenney_kits"]:
        if wanted and kit["slug"] not in wanted:
            continue
        try:
            fetch_kit(kit, lock, args.force)
        except (urllib.error.URLError, RuntimeError, zipfile.BadZipFile) as error:
            failures.append(f"{kit['slug']}: {error}")
            print(f"  FAILED {kit['slug']}: {error}")

    print(f"ambientCG textures -> {TEXTURES_DIR}")
    meta = sources["ambientcg_licence"]
    for texture in sources["ambientcg_textures"]:
        if wanted and texture["id"] not in wanted:
            continue
        try:
            fetch_texture(texture, meta, lock, args.force)
        except (urllib.error.URLError, RuntimeError, zipfile.BadZipFile) as error:
            failures.append(f"{texture['id']}: {error}")
            print(f"  FAILED {texture['id']}: {error}")

    LOCK.write_text(json.dumps(lock, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"lock file written: {LOCK}")
    if failures:
        print("\nSome sources failed. Re-run the script; already-fetched ones are skipped.")
        for failure in failures:
            print("  " + failure)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
