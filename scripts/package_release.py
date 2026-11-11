"""Create a research-beta offline download from built, allowlisted assets only."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    version = json.loads((ROOT / 'package.json').read_text('utf-8'))['version']
    built = ROOT / 'dist/index.html'
    if not built.is_file():
        raise SystemExit('Build first: node build.mjs')
    target = ROOT / 'release-artifacts'
    target.mkdir(exist_ok=True)
    archive = target / f'BRAIN_P-{version}-offline.zip'
    assets = {Path('index.html'): built}
    for name in ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'DATA_LICENSES.md',
                 'CHANGELOG.md', 'CITATION.cff', 'docs/KNOWN_LIMITATIONS.md',
                 'docs/RELEASE_NOTES_BETA.md']:
        assets[Path(name)] = ROOT / name
    # License notices only; runtime/data are already embedded in index.html.
    for p in (ROOT / 'vendor').glob('*LICENSE*'):
        if p.is_file():
            assets[p.relative_to(ROOT)] = p
    assets[Path('vendor/fonts/OFL.txt')] = ROOT / 'vendor/fonts/OFL.txt'
    for p in (ROOT / 'examples/generated').glob('*'):
        if p.is_file() and p.name.startswith(('SIMULATED_', 'README')):
            assets[Path('examples') / p.name] = p
    hashes = {name.as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for name, p in assets.items()}
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for name, p in assets.items():
            z.write(p, name.as_posix())
        z.writestr('manifest.json', json.dumps({
            'version': version, 'status': 'research prerelease',
            'sha256': hashes, 'originalCodeLicense': 'MIT',
            'atlasDataLicense': 'Separate Allen Institute terms; see DATA_LICENSES.md',
            'privateStudyDataIncluded': False,
            'instructions': 'Open index.html; packaged examples are synthetic phantoms only.'
        }, ensure_ascii=False, indent=2))
        z.writestr('START_HERE.txt',
                   'Open index.html in a recent Chrome or Edge browser.\n'
                   'No Node/Python is needed for core offline viewing.\n'
                   'README source-build commands are for the GitHub source archive, not this offline ZIP.\n'
                   'Examples are synthetic phantoms, not mouse anatomy or animal results.\n'
                   'Research beta. Read DATA_LICENSES.md and docs/KNOWN_LIMITATIONS.md.\n')
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            raise SystemExit('Archive integrity failed')
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    (target / 'SHA256SUMS.txt').write_text(f'{checksum}  {archive.name}\n', encoding='utf-8')
    print(json.dumps({'file': archive.name, 'bytes': archive.stat().st_size,
                      'files': len(assets), 'sha256': checksum}))


if __name__ == '__main__':
    main()
