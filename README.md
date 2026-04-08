# Birthday Wish Project

This project is a static GitHub Pages app.

**Audio mix levels** (mission BGM, startup, celebration, narration ducking, etc.) live in **`script.js`** as the `AUDIO` object. They are not set in profile JSON or HTML.

## Stable narration for all devices

To keep narration identical across browsers/OS, generate narration MP3s before deploy:

1. Install dependency:
   - `pip install edge-tts`
2. Generate narration (one file per profile under `profiles/*.json`):
   - `python scripts/generate_narration.py`
3. Commit generated files under:
   - `assets/narration/narration-<profile-slug>.mp3`  
   Paths come from each profile’s `narrationFile` field (see `profiles/default.json`).

The app plays the profile’s narration file first and only falls back to browser text-to-speech if the file cannot be played.

## Generate narration on GitHub

A workflow is included at `.github/workflows/generate-narration.yml`.

- It runs on push to `main` when narration inputs change (`profiles/*.json`, the script, or the workflow).
- It can also be run manually from the Actions tab (`workflow_dispatch`).
- If any `assets/narration/*.mp3` changes, it auto-commits the updated files.
