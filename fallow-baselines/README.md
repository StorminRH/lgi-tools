# Fallow duplication baseline

`.fallowrc.json` uses `dupes.json` as the accepted-duplication baseline. Its empty
`clone_groups` array is intentional: no duplication is waived.

Regenerate only after resolving reported duplication, never to hide new debt:

```bash
npx fallow dupes --save-baseline fallow-baselines/dupes.json
```
