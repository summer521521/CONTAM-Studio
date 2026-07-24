# v1 Design System Contract

## Semantic tokens

| Token | Meaning | Example use |
| --- | --- | --- |
| `protected-source` | immutable external source | source badge, project header |
| `draft-revision` | Studio-owned editable copy | Draft header, revision selector |
| `deterministic-evidence` | hash/validation/tool fact | evidence panel, report |
| `ai-interpretation` | model-generated explanation | Assistant answer label |
| `run-active` | controlled operation in progress | activity/status bar |
| `warning` | recoverable risk or missing input | inline diagnostic |
| `failure` | operation rejected or evidence invalid | error banner |
| `unsupported` | outside verified profile | compatibility panel |

Tokens are semantic, not hue-specific. Protected source uses a neutral high-contrast treatment; draft and active run use distinct accents; AI interpretation always carries a textual label and never uses color alone.

## Interaction rules

- Desktop-first dense work surface with stable toolbar, sidebar, inspector and bottom evidence panel dimensions.
- Every icon-only control has an accessible name and tooltip; destructive or irreversible actions use icon plus explicit text.
- Modals trap focus and support Escape only for cancel/back; confirmation buttons state the exact action and scope.
- Toasts announce completion or failure but never replace persistent evidence or required confirmation.
- All text must remain readable from 100% to 200% Windows scaling; controls may wrap labels without changing geometry.
- Loading, empty, read-only, unsupported, failure and recovery states are first-class; no placeholder success, fake projects or fake results.
- Keyboard order follows Project -> Draft -> Runs -> Results -> Compare -> Report -> Attachments -> Assistant -> Settings -> Activity -> Evidence.
