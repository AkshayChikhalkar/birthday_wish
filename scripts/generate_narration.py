import json
import pathlib
import re
import sys

try:
    import edge_tts
except ImportError:
    print("Missing dependency: edge-tts. Install with: pip install edge-tts")
    sys.exit(1)


ROOT = pathlib.Path(__file__).resolve().parents[1]
PROFILES_DIR = ROOT / "profiles"


def parse_string_value(profile: dict, key: str, default: str) -> str:
    value = profile.get(key, default)
    return str(value).strip() if value is not None else default


def require_string_value(profile: dict, key: str) -> str:
    value = parse_string_value(profile, key, "")
    if not value:
        raise ValueError(f"Missing required profile string: {key}")
    return value


def parse_int_value(profile: dict, key: str, default: int) -> int:
    raw = profile.get(key, default)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


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


def format_ordinal(value: int) -> str:
    num = abs(int(value))
    mod100 = num % 100
    if 11 <= mod100 <= 13:
        return f"{num}th"
    mod10 = num % 10
    if mod10 == 1:
        return f"{num}st"
    if mod10 == 2:
        return f"{num}nd"
    if mod10 == 3:
        return f"{num}rd"
    return f"{num}th"


def build_message(profile: dict) -> str:
    recipient = require_string_value(profile, "recipientName")
    agent = parse_string_value(profile, "agentName", recipient) or recipient
    greeting = parse_string_value(profile, "greeting", "Good evening")
    intro = parse_string_value(
        profile, "introLine", "Your next assignment has been delivered with full birthday-level priority."
    )
    year_prefix = parse_string_value(
        profile, "yearLinePrefix", "As of this moment, you are officially entering Year"
    )
    objectives_heading = parse_string_value(profile, "objectivesHeading", "Mission objectives:")
    acceptance = parse_string_value(
        profile,
        "acceptanceLine",
        "If you choose to accept this mission, your {ageOrdinal} year will be your boldest one yet.",
    )
    self_destruct_template = parse_string_value(
        profile, "selfDestructLineTemplate", "This message will self-destruct in {seconds} seconds."
    )
    closing = parse_string_value(profile, "closingLine", "Good luck, Agent.")
    dob = require_string_value(profile, "recipientDob")
    age = parse_age(dob)
    entering_year = age + 1
    entering_year_ordinal = format_ordinal(entering_year)
    countdown = parse_int_value(profile, "countdownSeconds", 0)
    if countdown <= 0:
        raise ValueError("Missing or invalid profile int: countdownSeconds")
    objectives = profile.get("objectives")
    if not isinstance(objectives, list) or not objectives:
        raise ValueError("Missing required profile array: objectives")
    self_destruct_line = self_destruct_template.replace("{seconds}", str(countdown))

    lines = [
        f"{greeting}, Agent {agent}.",
        intro,
        f"{year_prefix} {entering_year}.",
        objectives_heading,
        *objectives,
        acceptance.replace("{ageOrdinal}", entering_year_ordinal).replace("{age}", str(entering_year)),
        self_destruct_line,
        closing,
    ]
    return " ".join(lines)


async def generate_mp3(text: str, voice: str, rate: str, output_path: pathlib.Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    communicator = edge_tts.Communicate(text=text, voice=voice, rate=rate)
    await communicator.save(str(output_path))


def get_output_path(profile: dict) -> pathlib.Path:
    narration_file = parse_string_value(profile, "narrationFile", "./assets/narration.mp3")
    relative_path = narration_file[2:] if narration_file.startswith("./") else narration_file
    return ROOT / relative_path


def load_profiles() -> list[tuple[pathlib.Path, dict]]:
    profile_files = sorted(PROFILES_DIR.glob("*.json"))
    if not profile_files:
        raise ValueError("No profile JSON files found in profiles/")
    items = []
    for profile_path in profile_files:
        profile = json.loads(profile_path.read_text(encoding="utf-8"))
        items.append((profile_path, profile))
    return items


def main():
    import asyncio

    for profile_path, profile in load_profiles():
        text = build_message(profile)
        voice = parse_string_value(profile, "narrationVoice", "en-US-ChristopherNeural")
        rate = parse_string_value(profile, "narrationRate", "-5%")
        output_path = get_output_path(profile)
        asyncio.run(generate_mp3(text, voice=voice, rate=rate, output_path=output_path))
        print(f"Narration generated from {profile_path.name}: {output_path}")


if __name__ == "__main__":
    main()
