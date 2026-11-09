# Human vocal reactions — V2.27

The pain grunts and death reactions are edited human recordings by **HaelDB**,
from [Male Grunt/Yelling sounds](https://opengameart.org/content/male-gruntyelling-sounds).
The creator offers OGA-BY 3.0 and CC0; this project selects **CC0 1.0**:
https://creativecommons.org/publicdomain/zero/1.0/ . Source checked 2026-11-09.

Original archive: https://opengameart.org/sites/default/files/yelling%20sounds.zip

SHA256: `e9100a4e3b9dcd146993089970dc6097dcf9935fa4683b196040012bad65d67a`

The author's four performer groups are assigned consistently: group 1 to scout,
group 3 to veteran, group 2 to leader, and the unprefixed group to the player.
Each role has three brief takes, three stronger injury takes and two terminal
takes. These are vocal reflexes, separate from the existing synthesized Chinese
tactical dialogue. The human performers and the dialogue presets are different
sources; this update does not claim that all voices are recordings of one actor.

`human-vocal-reactions.json` records the source file, exact excerpt and target
peak for all 32 takes. `dist/audio/reactions/manifest.json` records original and
output hashes, final decoded durations and levels. No pitch shifting, time
stretching, voice cloning, TTS or paid inference service is used for these takes.
Edits trim excess silence, filter rumble, apply small edge fades and set gain;
the natural vocal performance remains intact.

To reproduce with Python and FFmpeg:

```sh
python scripts/prepare-human-reactions.py --cache /path/to/development-cache
```

The helper downloads the original archive only when absent and verifies its
SHA256 before editing. Original WAVs and the archive stay in the development
cache; the browser downloads only the 32 derived MP3s (287,608 bytes total).
Credits are also retained in the deployed `ASSET-CREDITS.txt`.
