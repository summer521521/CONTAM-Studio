# NIST CONTAM runtime attribution

CONTAM Studio can package the unchanged 64-bit ContamX, SimRead, SimComp and
PrjUp executables from the official NIST CONTAM download page:

<https://www.nist.gov/el/beed/nist-multizone-modeling/software/contam/download-contam>

The Phase 6C lock is for CONTAM release 3.4.0.8 and the ContamX 3.4.0.3
Windows x64 ZIP. The build script verifies the ZIP and every packaged file
before a Tauri resource is assembled. No NIST binary is modified.

NIST describes CONTAM as a public-domain federal-government work and provides
it without warranties or guarantees. The official source and no-warranty
notice remain part of the packaged notices. CONTAM Studio is an independent
application and is not an official NIST product.
