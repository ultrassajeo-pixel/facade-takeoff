#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"
if ! command -v python3 >/dev/null; then
  print 'Python 3가 필요합니다. Python 3 설치 후 다시 실행해주세요.'
  read '?엔터를 누르면 닫습니다.'
  exit 1
fi
if ! command -v node >/dev/null; then
  print 'Node.js 22 이상이 필요합니다. 설치 후 다시 실행해주세요.'
  exit 1
fi
python3 bootstrap.py
python3 - <<'PY'
import json, socket, subprocess, sys, time, urllib.request
from pathlib import Path
root=Path.cwd()
port=8765
try:
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/_health',timeout=1) as r:
        existing=json.load(r)
    if existing.get('application')=='facade-workspace':
        subprocess.run(['open','-a','Safari',f'http://127.0.0.1:{port}'])
        print('이미 실행 중인 작업실을 열었습니다.')
        sys.exit(0)
except Exception: pass
try:
    probe=socket.socket();probe.bind(('127.0.0.1',port));probe.close()
except OSError:
    print('8765 포트를 다른 프로그램이 사용 중입니다. 종료 후 다시 실행해주세요.')
    sys.exit(1)
child=subprocess.Popen(['node',str(root/'server.mjs')])
try:
    for _ in range(50):
        if child.poll() is not None: raise RuntimeError('작업실을 시작하지 못했습니다.')
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/_health',timeout=.5).close()
            break
        except Exception: time.sleep(.1)
    else: raise RuntimeError('작업실 응답이 없습니다.')
    subprocess.run(['open','-a','Safari',f'http://127.0.0.1:{port}'])
    print('사파리에서 작업하시면 됩니다. 종료하려면 이 창에서 Ctrl+C를 누르세요.')
    child.wait()
except KeyboardInterrupt: pass
finally:
    child.terminate()
PY
