import pathlib
import re
import sys

try:
    import edge_tts
except ImportError:
    print("Missing dependency: edge-tts. Install with: pip install edge-tts")
    sys.exit(1)


ROOT = pathlib.Path(__file__).resolve().parents[1]
METADATA_PATH = ROOT / "metadata.js"
OUTPUT_PATH = ROOT / "assets" / "narration.mp3"


def read_metadata() -> str:
    return METADATA_PATH.read_text(encoding="utf-8")


def parse_string_value(source: str, key: str, default: str) -> str:
    pattern = re.compile(rf"{re.escape(key)}\s*:\s*\"([^\"]*)\"")
    match = pattern.search(source)
    return match.group(1) if match else default


def require_string_value(source: str, key: str) -> str:
    value = parse_string_value(source, key, "").strip()
    if not value:
        raise ValueError(f"Missing required metadata string: {key}")
    return value


def parse_objectives(source: str) -> list[str]:
    match = re.search(r"objectives\s*:\s*\[(.*?)\]", source, flags=re.S)
    if not match:
        return []
    raw = match.group(1)
    return re.findall(r"\"([^\"]+)\"", raw)


def parse_int_value(source: str, key: str, default: int) -> int:
    pattern = re.compile(rf"{re.escape(key)}\s*:\s*(\d+)")
    match = pattern.search(source)
    return int(match.group(1)) if match else default


def parse_age(dob: str) -> int:
    parts = re.split(r"[./-]", dob.strip())
    if len(parts) != 3:
        return 27
    nums = []
    for item in parts:
        if not item.isdigit():
            return 27
        nums.append(int(item))
    if nums[0] > 999:
        year, month, day = nums
    else:
        day, month, year = nums
    from datetime import date

    today = date.today()
    age = today.year - year
    if (today.month, today.day) < (month, day):
        age -= 1
    return age if age >= 0 else 27


def build_message(source: str) -> str:
    recipient = require_string_value(source, "recipientName")
    agent = parse_string_value(source, "agentName", recipient).strip() or recipient
    greeting = require_string_value(source, "greeting")
    intro = require_string_value(source, "introLine")
    year_prefix = require_string_value(source, "yearLinePrefix")
    objectives_heading = require_string_value(source, "objectivesHeading")
    acceptance = require_string_value(source, "acceptanceLine")
    self_destruct_template = require_string_value(source, "selfDestructLineTemplate")
    closing = require_string_value(source, "closingLine")
    dob = require_string_value(source, "recipientDob")
    age = parse_age(dob)
    countdown = parse_int_value(source, "countdownSeconds", 0)
    if countdown <= 0:
        raise ValueError("Missing or invalid metadata int: countdownSeconds")
    objectives = parse_objectives(source)
    if not objectives:
        raise ValueError("Missing required metadata array: objectives")
    self_destruct_line = self_destruct_template.replace("{seconds}", str(countdown))

    lines = [
        f"{greeting}, Agent {agent}.",
        intro,
        f"{year_prefix} {age}.",
        objectives_heading,
        *objectives,
        acceptance.replace("{age}", str(age)),
        self_destruct_line,
        closing,
    ]
    return " ".join(lines)


async def generate_mp3(text: str, voice: str, rate: str):
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    communicator = edge_tts.Communicate(text=text, voice=voice, rate=rate)
    await communicator.save(str(OUTPUT_PATH))


def main():
    source = read_metadata()
    text = build_message(source)
    voice = parse_string_value(source, "narrationVoice", "en-US-ChristopherNeural")
    rate = parse_string_value(source, "narrationRate", "-5%")
    import asyncio

    asyncio.run(generate_mp3(text, voice=voice, rate=rate))
    print(f"Narration generated: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
