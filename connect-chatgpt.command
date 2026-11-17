#!/bin/zsh
set -eu
if [[ -x /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex ]]; then
  facade_codex=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
elif [[ -x /Applications/Codex.app/Contents/Resources/codex ]]; then
  facade_codex=/Applications/Codex.app/Contents/Resources/codex
elif command -v codex >/dev/null; then
  facade_codex=$(command -v codex)
else
  print 'ChatGPT 앱 또는 공식 Codex CLI가 필요합니다.'
  read '?엔터를 누르면 닫습니다.'
  exit 1
fi
print '사용할 ChatGPT 계정으로 로그인해주세요. 공식 로그인 화면이 열립니다.'
"$facade_codex" login
print '로그인 후 외벽산출의 AI 연결 설정에서 구독 연결 상태를 확인해주세요.'
read '?엔터를 누르면 닫습니다.'
