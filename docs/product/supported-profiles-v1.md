# v1 Supported Profile Candidates

## Candidate A：官方contamxpy Zone-volume / Zone-air-state

| Field | Contract |
| --- | --- |
| Source | `fixtures/contam/official-contamxpy/test_GetPrjInfo.prj` from `contamxpy 0.0.9` source distribution |
| Source hash | `ce37f7bfb7f95ac49babb117e49a22bbba5da7694491060b3166554efcccd96e` |
| Licence evidence | Included `LICENSE.txt`; NIST public-domain notice plus SUNDIALS BSD notice; exact redistribution decision remains `pending_final_acceptance` |
| Required PRJ sections | Strict ContamW 3.4.0.4 simple Zone block, 19 fields, `cdaxis=vf_type=cfd=0`, `-999` terminator |
| Editable object | One Zone `volume_m3`; no renumbering, no reference rewrite, one PatchTransaction |
| Companion inputs | None for strict reader; official run may require user-configured ContamX identity |
| Result | `zone_air_state`: time seconds, temperature K, reference pressure Pa, air density kg/m3 |
| Official evidence | Historical local verification exists for ContamX/SimRead; candidate release evidence is `pending_final_acceptance` |
| Exclusions | Unknown PRJ blocks, non-simple Zone layouts, unsupported fields, arbitrary SIM, batch runs, scientific assumptions |
| Human inputs | Source selection, proposed volume and unit confirmation, tool identity, run approval, report destination |

## Candidate B：NIST tutorial Zone-volume / Zone-air-state

| Field | Contract |
| --- | --- |
| Source | `fixtures/contam/official-nist-tutorials/demo1c.prj` from NIST `IntroToCONTAM-part1-6.zip` |
| Source hash | `1e2623d8904c0d37f0eb207099782ad2c1895dba4032e0511b9c8a188748f406` |
| Licence evidence | Download package has no independent licence/notice; do not redistribute until reviewed, keep fixture for local evidence only |
| Required PRJ sections | Strict ContamW 3.4.0.0 simple Zone block with the same parser and fail-closed conditions |
| Editable object | One Zone `volume_m3`, using the same semantic operation as Candidate A |
| Companion inputs | None for strict reader; official run inputs remain explicit and hash-bound |
| Result | Same `zone_air_state` family and units; no interpolation or inferred day type |
| Official evidence | Historical local verification exists; licence and candidate release rows are `pending_final_acceptance` |
| Exclusions | All unsupported blocks, extra object families, arbitrary result types and automatic source discovery |
| Human inputs | Same as Candidate A; teacher must confirm the tutorial's instructional purpose |

## Recommendation

Use Candidate A as the smallest v1 implementation profile because its source package includes an explicit notice and existing strict/official evidence. Candidate B remains a second same-family profile candidate and cannot be distributed until its notice status is reviewed. Neither candidate promises arbitrary PRJ support.
