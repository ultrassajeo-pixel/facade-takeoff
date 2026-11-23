#!/usr/bin/env python3
"""Build the per-user universal macOS Installer. No developer home data is copied."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import plistlib
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
# Corresponding source embedded in the installed bundle has a separate workspace root.
if not (ROOT / 'package.json').is_file() and (ROOT / 'workspace/package.json').is_file():
    ROOT = ROOT / 'workspace'
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
BUILD = json.loads((HERE / 'release.json').read_text())
MAC_VERSION = VERSION + '.' + str(BUILD['revision'])
PACKAGE_ID = 'com.ultrassa.facadetakeoff'
ARCHIVES = {
    'arm64': ('aarch64', '1d64136c8a43d648d1b3bad10797a4c995b1ca032d2bde8799de43b37f058fe5',
              'hIYTkRUpuYpkVfTq4cpby0PXqhAVcIgE7f6FoyY1lt2RyARj3GXS1Can/dIYUBItVhXzhb98HYHZNzCX74QRlQ=='),
    'x64': ('x86_64', '4daeec962855c1a6e66cda398a25037319dc1bbd4a0939188b3547afbbfb6490',
            'pwN5uNEKx/mZjwBEf/6CKq6SJMfJS5kruV3sJQAk7ebIPvC58Ote3CicIxETDZtjLj35rNv3PLPd7mHCg6hGPw==')
}
FILES = ['server.mjs', 'server-api.mjs', 'docx-reader.mjs', 'docx-text.xsl', 'read_docx.py',
         'project-store.mjs', 'chatgpt-plan.mjs', 'index.html', 'package.json',
         'samples/facade_sample_12m_6m.dwg', 'samples/facade_sample_12m_6m.dwgadd',
         'vendor/libredwg/dist/libredwg-web.js', 'vendor/libredwg/wasm/libredwg-web.wasm',
         'vendor/libredwg/wasm/libredwg-web.js', 'vendor/pdfjs/build/pdf.mjs', 'vendor/pdfjs/build/pdf.worker.mjs']

def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)

def copy(src, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)

def fetch(cache, name, url, digest, algorithm):
    archive = cache / name
    if not archive.exists():
        with tempfile.NamedTemporaryFile(dir=cache, delete=False) as temp:
            with urllib.request.urlopen(url, timeout=120) as response:
                shutil.copyfileobj(response, temp)
        Path(temp.name).replace(archive)
    h = hashlib.new(algorithm)
    with archive.open('rb') as stream:
        for block in iter(lambda: stream.read(1048576), b''):
            h.update(block)
    actual = h.hexdigest() if algorithm == 'sha256' else base64.b64encode(h.digest()).decode()
    if actual != digest:
        raise ValueError(f'Checksum mismatch: {archive}')
    return archive

def extract(archive, members):
    with tarfile.open(archive, 'r|*') as source:
        for member in source:
            if member.name in members and member.isfile():
                target = members.pop(member.name)
                with target.open('wb') as output:
                    shutil.copyfileobj(source.extractfile(member), output)
                if not members:
                    return
    raise ValueError(f'Missing archive members: {list(members)}')

def runtimes(cache, stage, resources):
    runtime = resources / 'runtime'
    runtime.mkdir()
    for arch, (machine, node_hash, codex_hash) in ARCHIVES.items():
        node = f'node-v24.22.3-darwin-{arch}'
        archive = fetch(cache, f'facade-node-v24.22.3-{arch}.tar.xz',
                        f'https://nodejs.org/dist/v24.22.3/{node}.tar.xz', node_hash, 'sha256')
        extract(archive, {f'{node}/bin/node': stage / f'node-{arch}', f'{node}/LICENSE': resources / 'NODE-LICENSE.txt'})
        archive = fetch(cache, f'facade-codex-0.171.0-{arch}.tgz',
                        f'https://registry.npmjs.org/@openai/codex/-/codex-0.171.0-darwin-{arch}.tgz',
                        codex_hash, 'sha512')
        extract(archive, {f'package/vendor/{machine}-apple-darwin/bin/codex': stage / f'codex-{arch}'})
    for tool in ['node','codex']:
        output = runtime / tool
        run('/usr/bin/lipo', '-create', stage / f'{tool}-arm64', stage / f'{tool}-x64', '-output', output)
        output.chmod(0o755)
        # The upstream slices have their own signatures. Preserve and validate both.
        run('/usr/bin/codesign','--verify','--all-architectures',output)

def stage_app(cache, stage):
    app = stage / 'payload/Facade Takeoff.app'
    contents = app / 'Contents'
    resources, macos = contents / 'Resources', contents / 'MacOS'
    web = resources / 'workspace'
    macos.mkdir(parents=True)
    for rel in FILES:
        copy(ROOT / rel, web / rel)
    for rel in ['src','config','licenses','vendor/polygon-clipping','vendor/pdfjs/cmaps','vendor/pdfjs/standard_fonts']:
        for file in (ROOT / rel).rglob('*'):
            if file.is_file() and not any(p.startswith('.') for p in file.relative_to(ROOT).parts):
                if file.is_symlink():
                    raise ValueError(f'Unexpected application symlink: {file}')
                copy(file, web / file.relative_to(ROOT))
    copy(HERE / 'workspace-server.mjs', web / 'workspace-server.mjs')
    for name in ['Launcher.m', 'build.py', 'release.json', 'update.mjs', 'workspace-server.mjs', 'CODEX-NOTICE.txt','NOTICE.md']:
        copy(HERE / name, resources / 'packaging/macos' / name)
    copy(HERE / 'NOTICE.md', resources / 'NOTICE.md')
    plist = dict(CFBundleIdentifier=PACKAGE_ID, CFBundleName='외벽산출', CFBundleDisplayName='외벽산출',
                 CFBundleExecutable='FacadeTakeoff', CFBundleShortVersionString=VERSION,
                 FacadeMacVersion=MAC_VERSION, CFBundleVersion=BUILD['bundleVersion'], CFBundlePackageType='APPL', CFBundleInfoDictionaryVersion='6.0',
                 LSMinimumSystemVersion='13.5', LSMultipleInstancesProhibited=True,
                 NSHighResolutionCapable=True, NSPrincipalClass='NSApplication')
    (contents / 'Info.plist').write_bytes(plistlib.dumps(plist))
    run('/usr/bin/xcrun', 'clang','-arch','arm64','-arch','x86_64','-mmacosx-version-min=13.5','-fobjc-arc',
        '-Wno-deprecated-declarations','-framework','AppKit','-framework','CoreServices',HERE / 'Launcher.m','-o', macos / 'FacadeTakeoff')
    runtimes(cache, stage, resources)
    run('/usr/bin/codesign', '--force','--sign','-','--timestamp=none',app)
    run('/usr/bin/codesign', '--verify','--deep','--strict','--all-architectures',app)
    return app

def package(stage, app, destination):
    component = stage / 'FacadeCore.pkg'
    config = [{'RootRelativeBundlePath':app.name, 'BundleIsRelocatable':False, 'BundleIsVersionChecked':True,
               'BundleOverwriteAction':'upgrade','BundleHasStrictIdentifier':True}]
    plist = stage / 'components.plist'
    plist.write_bytes(plistlib.dumps(config))
    run('/usr/bin/pkgbuild','--root',app.parent,'--install-location','/Applications','--identifier',PACKAGE_ID,
        '--version',MAC_VERSION,'--ownership','recommended','--component-plist',plist,component)
    dist = stage / 'Distribution.xml'
    dist.write_text(f'''<installer-gui-script minSpecVersion="2">
<title>외벽산출</title>
<options customize="never" require-scripts="false" hostArchitectures="arm64,x86_64"/>
<domains enable_anywhere="false" enable_currentUserHome="true" enable_localSystem="false"/>
<volume-check><allowed-os-versions><os-version min="13.5"/></allowed-os-versions></volume-check>
<choices-outline><line choice="app"/></choices-outline>
<choice id="app" visible="false"><pkg-ref id="{PACKAGE_ID}"/></choice>
<pkg-ref id="{PACKAGE_ID}" version="{MAC_VERSION}">FacadeCore.pkg</pkg-ref>
</installer-gui-script>''')
    destination.parent.mkdir(parents=True, exist_ok=True)
    built = stage / 'Facade.pkg'
    run('/usr/bin/productbuild','--distribution',dist,'--package-path',stage,built)
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as temp:
        with built.open('rb') as original:
            shutil.copyfileobj(original, temp)
    Path(temp.name).chmod(0o644)
    Path(temp.name).replace(destination)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=Path.home() / 'Library/Caches/FacadeBuild')
    parser.add_argument('--output', type=Path, default=ROOT / f'deployment/Facade-Takeoff-{MAC_VERSION}-Mac.pkg')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='facade-mac-') as tmp:
        stage = Path(tmp)
        app = stage_app(args.cache, stage)
        package(stage, app, args.output.resolve())
    print(args.output.resolve())
