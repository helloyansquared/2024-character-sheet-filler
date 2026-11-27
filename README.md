# 2024 Character Sheet Filler

**https://2024-character-sheet-filler.yansquared.com/**

Free web tool: load the character PDF you exported from D&D Beyond (**Manage → Export to PDF**) and get the official two-page **2024 character sheet** (the form-fillable one from the D&D Beyond Free Rules), filled in and still editable. Everything runs in the browser; files are never uploaded.

## How it works
- `public/core.js` reads the export. D&D Beyond writes it with PDFsharp and no `/AcroForm` entry, so normal form readers see zero fields; the values are in each page's widget annotations, written as plain objects. We scan those directly (no library).
- It maps them to a character (abilities, saves, skills, attacks, features, equipment, coins, spells by level, slots) and fills the official sheet with [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT, self-hosted in `public/vendor/`). Text that doesn't fit shrinks to 6 pt; anything still too long goes on a continuation page, so nothing is dropped.
- The visitor downloads the blank sheet from D&D Beyond and adds it; D&D Beyond's file server only allows its own site to fetch it directly (CORS). It is not hosted or redistributed here.

| What | Checked against real exports |
|---|---|
| Levels | 1 to 8 |
| Classes | Bard, Cleric, Druid, Fighter, Paladin |
| Rules | 2014 and 2024; one 2023 export (older template swaps score and modifier fields) |
| Not yet | Level 10+, Warlock pact slots, multiclass spellcasters |

Problems or samples: open an issue or email hello@yansquared.com. Please don't attach other people's characters.

## Develop
```
node test/core.test.mjs        # builds public/sample/ (a made-up character) and tests reading + mapping
```
No real person's character is stored in this repository; tests against real exports use field dumps kept outside it (`REAL_DUMPS=/path/samples.json`).

Static site in `public/`, Cloudflare Pages Functions in `functions/` (`/api/hit` = anonymous step counter, see `/privacy/`).

## Legal
2024 Character Sheet Filler is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC. Not affiliated with D&D Beyond.

Code: MIT. The 2024 character sheet itself is © Wizards of the Coast and is not included.
