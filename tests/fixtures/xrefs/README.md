# Synthetic external reference fixture

`host.dwg` is an R2000 DWG with a single external INSERT named `facade`, at (1000, 2000), scale 1 and rotation 0. Its saved reference path is `refs/facade.dwg`.

`refs/facade.dwg` is a byte-for-byte copy of the generated 12m × 6m sample in `samples/`. It contains no user drawing data. `generate.c` creates the host using LibreDWG 0.14 (`cc ... -lredwg`; pass the desired output filename to the executable). Regeneration is not required to run tests.

Expected host geometry: wall corners (1000,2000), (13000,2000), (13000,8000), (1000,8000). Two windows and one door are translated by the same amount. Quantities use the explicitly synthetic `sampleConditions` fixture, not site conditions.
