# Synthetic XCLIP DWG fixtures

`generate.c` uses LibreDWG 0.14 to create R2000 external references with per-INSERT extension dictionaries and SPATIAL_FILTER records. `refs/facade.dwg` is the unchanged generated 12m × 6m sample. No user drawing is included.

Compile with LibreDWG headers/library; pass output path and one of rectangle, triangle, off, inverted. The host inserts the sample at (1000,2000). Regular clip vertices are in host coordinates and the inverse matrix subtracts this insertion. Inverted adds ACAD_XREC_ROUNDTRIP metadata.

Independent visible gross/net areas (m²): rectangle 36/32.04, triangle 36/31.32, inverted 64/58.60, off 72/65.52. These fixtures verify native binary interpretation; they have not been compared to an AutoCAD screenshot or a real project.
