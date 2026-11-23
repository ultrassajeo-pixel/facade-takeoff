# 외벽산출 Mac 설치판

본인 계정의 응용 프로그램 폴더(~/Applications)에 Facade Takeoff.app(외벽산출)을 설치합니다. Finder에서 이 앱을 열면 Safari에 작업실이 열립니다. 앱 창을 닫으면 로컬 서버도 종료됩니다. ChatGPT를 사용할 때만 앱 창의 **ChatGPT 로그인**을 누르고 사용할 계정으로 인증하세요.

앱의 실행 소스는 Contents/Resources/workspace, 실행기와 재빌드 소스는 Contents/Resources/packaging/macos에 있습니다. 개발 PC에서 Python 3와 Xcode Command Line Tools로 packaging/macos/build.py를 실행합니다. 사용자는 개발 도구를 설치할 필요가 없습니다.

- 앱 및 DWG 엔진은 GNU GPL v3로 제공합니다. 라이선스 전문은 workspace/licenses/GPL-3.0.txt에 있습니다. @mlightcad/libredwg-web 0.8.8 대응 소스 및 빌드 지침은 https://github.com/mlightcad/libredwg-web/tree/26f9929134c88d6058bd48d201efebe638e21d89 에서 제공하며 jsmn 의존 소스는 https://github.com/zserge/jsmn/tree/85695f3 에 있습니다.
- PDF.js 4.10.38은 Apache-2.0이며 소스는 https://github.com/mozilla/pdf.js/tree/v4.10.38 에 있습니다. 라이선스는 workspace/licenses/PDFJS-LICENSE.txt에 있습니다.
- polygon-clipping 0.15.7은 MIT이며 UMD 포장만 ESM으로 변경했습니다. 소스는 https://github.com/mfogel/polygon-clipping/tree/v0.15.7 에 있으며 저작권 고지는 workspace/licenses/POLYGON-CLIPPING-LICENSE.md에 있습니다.
- Node.js v24.22.3과 포함 구성요소의 라이선스는 NODE-LICENSE.txt에 있습니다. 대응 소스는 https://nodejs.org/dist/v24.22.3/node-v24.22.3.tar.xz 에서 제공합니다.
- OpenAI Codex CLI 0.171.0 실행 파일은 Apache-2.0입니다. 소스는 https://github.com/openai/codex/tree/rust-v0.171.0 에 있으며 고지는 packaging/macos/CODEX-NOTICE.txt에 있습니다. 인증은 사용자 Mac에서 공식 Codex가 담당합니다.
