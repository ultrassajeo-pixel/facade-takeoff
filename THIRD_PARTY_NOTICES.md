# Third-party components

The source distribution does not include the DWG engine binary. `bootstrap.py` downloads the pinned package below from its upstream registry and verifies its SHA-512 integrity.

- `@mlightcad/libredwg-web` 0.8.8: https://github.com/mlightcad/libredwg-web . WebAssembly bindings and conversion layer built on GNU LibreDWG. Upstream licensing is GPL-3.0; consult the fetched package and corresponding upstream source before redistribution or hosted deployment.
- GNU LibreDWG: https://www.gnu.org/software/libredwg/ and https://github.com/LibreDWG/libredwg . GPL-3.0-or-later. The four files in `tests/fixtures/` are public upstream DWG regression fixtures. Their original bytes are retained. The GNU GPL v3 text accompanies them as `licenses/GPL-3.0.txt`.
- `samples/facade_sample_12m_6m.dwg` is newly generated synthetic geometry, created using GNU LibreDWG 0.14 `dwgadd`. The editable recipe and all dimensions are included. No customer drawing is used.

The sample generator can reproduce its recipe with `python3 tests/generate_native_sample.py`. Creating a new DWG from that recipe requires a locally available LibreDWG `dwgadd` executable; the application itself does not require that executable.

- PDF.js (`pdfjs-dist` 4.10.38): https://github.com/mozilla/pdf.js . Apache-2.0. `bootstrap.py` fetches the pinned npm distribution. The license is included as `licenses/PDFJS-LICENSE.txt`; the source distribution excludes its runtime files.

- OpenAI Codex CLI: https://github.com/openai/codex . Used as a separately installed official runtime for ChatGPT subscription authentication and structured language responses. Neither the CLI binary nor credentials are included in this distribution. The bridge was exercised with `codex-cli 0.169.0-alpha.11.1`; CLI compatibility is checked at execution time.

- polygon-clipping 0.15.7: https://github.com/mfogel/polygon-clipping/tree/v0.15.7 . MIT. Only the UMD wrapper was replaced with an ESM export. License and provenance are in `vendor/polygon-clipping/`.
- Additional XREF/XCLIP fixtures are synthetic; their C generation recipes are in `tests/fixtures/xrefs/` and `tests/fixtures/xclip/`.
