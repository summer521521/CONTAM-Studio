# v1 Bilingual Terminology Contract

The JSON glossary at `contracts/bilingual-terminology.v1.json` is the machine source. Chinese is the default display language; English keys are stable and are not exposed as developer jargon unless needed for evidence.

## Interpretation labels

- `事实 / Fact`: source, hash, size, tool identity, deterministic measurement.
- `确定性验证 / Deterministic validation`: parser, Patch precondition, identity, quota or lifecycle result.
- `AI解释 / AI interpretation`: optional model narrative, always labeled and citation-bound.
- `不确定 / Uncertainty`: missing or conflicting evidence; never silently converted to a fact.
- `不支持 / Unsupported`: outside the verified profile; read-only or rejected.
- `待最终验收 / Pending final acceptance`: implementation exists but needs real GUI/tool/provider/clean-machine/user evidence.

Units are SI/domain units from the semantic contract. Temperatures are K in result data, pressures Pa, density kg/m3, volume m3, and time seconds. Display conversion is presentation-only and never changes stored values. Rounding is explicit per field and raw deterministic values remain in evidence.
