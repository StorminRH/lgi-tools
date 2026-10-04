The wormhole icon is the unmodified CCP `Icons/Overview/Icon_bracket_wormhole.png` asset from `eve-icons-react@0.1.14`, copied from the CCP variant in PR #532.

The Production Capacity icons are unmodified CCP client assets downloaded from `resources.eveonline.com`, resolved through the EVE client build **3561556** [resource index](https://binaries.eveonline.com/1d/1d34143a37d4b739_b8f96a69c87e4bf1e6cfe65d403e0cea).

| Local file | Original client path | Source |
| --- | --- | --- |
| `industry-manufacturing.png` | `res:/ui/texture/classes/industry/activity/manufacturing.png` | [CCP CDN](https://resources.eveonline.com/85/85906b28d2c321e8_bb17c55646b8d01f9d71f6eeaa9a56d8) |
| `industry-reactions.png` | `res:/ui/texture/classes/industry/activity/reaction.png` | [CCP CDN](https://resources.eveonline.com/65/654aa611e08c2e31_97270e0a9dbdca14cab60bfef6783d90) |
| `industry-science.png` | `res:/ui/texture/eveicon/category_icons/science_32px.png` | [CCP CDN](https://resources.eveonline.com/9f/9f68fe1601cfce68_031f2f103abd4be0d9069feec6da5a8d) |

Manufacturing and reactions match the activity icons in CCP's [Activities and Job Types](https://support.eveonline.com/hc/en-us/articles/203210272-Activities-and-Job-Types). Science uses the generic Science category icon for the shared research, copying, and invention slot pool.

The industry planner's ME, TE, and runs glyphs are unmodified CCP client assets from the same CDN, resolved through the EVE client build **3569502** [resource index](https://binaries.eveonline.com/1d/1d34143a37d4b739_d5b708b753fd9006ebdc0ffd66e6cc79). Each file's MD5 matches the index entry.

| Local file | Original client path | Source |
| --- | --- | --- |
| `industry-me.png` | `res:/ui/texture/classes/industry/iconme.png` | [CCP CDN](https://resources.eveonline.com/36/36a4a004f1a12a41_4c2cd03bc50effd317ab47d126890c52) |
| `industry-te.png` | `res:/ui/texture/classes/industry/iconte.png` | [CCP CDN](https://resources.eveonline.com/c0/c0e9b98181eeed3a_cbe29effeb453dfea6ddede5484d457e) |
| `industry-runs.png` | `res:/ui/texture/eveicon/system_icons/refresh_16px.png` | [CCP CDN](https://resources.eveonline.com/6d/6d47009f90400dda_4b8a51fec2d4b6f96bb87c2b3a51a55a) |

ME and TE are the efficiency icons from the client's industry window. The client has no dedicated runs icon, so runs uses the generic refresh system icon. The glyphs are white on transparent, and the planner tints them through a CSS mask.

Structure hulls need no local copy: they use each hull's type icon from the EVE image server, like every other type.

EVE Online and this artwork belong to CCP hf. The artwork follows the project's EVE developer-license precedent and is not covered by the repository's MIT license.
