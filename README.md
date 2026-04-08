# Birthday Wish Project

This project is a static GitHub Pages app.

## Stable narration for all devices

To keep narration identical across browsers/OS, generate one narration file before deploy:

1. Install dependency:
   - `pip install edge-tts`
2. Generate narration:
   - `python scripts/generate_narration.py`
3. Commit generated file:
   - `assets/narration.mp3`

The app plays `assets/narration.mp3` first and only falls back to browser text-to-speech if the file cannot be played.

## Generate narration on GitHub

A workflow is included at `.github/workflows/generate-narration.yml`.

- It runs on push to `main` when narration inputs change.
- It can also be run manually from the Actions tab (`workflow_dispatch`).
- If `assets/narration.mp3` changes, it auto-commits the updated file.
