"""Verify the Windows release manifests and updater SHA-512 before publication."""
import hashlib
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
import base64
import pefile

root = pathlib.Path(sys.argv[1]).resolve()
version = sys.argv[2]
records = []
for name in [f"Voldena-Storage-{version}-x64-setup.exe", f"Voldena-Storage-{version}-x64-portable.exe", "win-unpacked/VoldenaStorage.exe"]:
    file = root / name
    assert file.stat().st_size > 10_000_000, f"Incomplete executable: {name}"
    pe = pefile.PE(str(file), fast_load=True)
    pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_RESOURCE']])
    levels = []
    for resource_type in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        if resource_type.id != 24:
            continue
        for resource_name in resource_type.directory.entries:
            for language in resource_name.directory.entries:
                data = language.data.struct
                xml = ET.fromstring(pe.get_data(data.OffsetToData, data.Size))
                levels.extend(node.attrib.get("level") for node in xml.iter() if node.tag.endswith("requestedExecutionLevel"))
    pe.close()
    assert "requireAdministrator" in levels, f"Administrator manifest missing: {name}"
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    records.append({"file": name, "bytes": file.stat().st_size, "sha256": digest.hexdigest(), "executionLevel": "requireAdministrator"})

manifest = (root / "latest.yml").read_text(encoding="utf-8")
expected = re.search(r"^sha512:\s*(\S+)", manifest, re.M).group(1)
installer = root / f"Voldena-Storage-{version}-x64-setup.exe"
digest = hashlib.sha512()
with installer.open("rb") as stream:
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)
assert base64.b64encode(digest.digest()).decode() == expected, "Updater SHA-512 differs from setup"
assert f"version: {version}" in manifest, "Updater version differs"
assert installer.name in manifest, "Updater filename differs"
print(json.dumps({"version": version, "artifacts": records, "updaterSha512Matches": True}, ensure_ascii=False, indent=2))
