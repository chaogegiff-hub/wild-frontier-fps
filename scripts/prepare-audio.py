#!/usr/bin/env python3
"""Prepare recorded CC0 effects; no oscillators or synthesized gunshot noise.

Requires ffmpeg and numpy. Optional downloads use the author's public HQ
previews; they are lossy source recordings, then exported as PCM16 WAV for
predictable decodeAudioData support. Run with --source-dir DIR --output-dir DIR.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import urllib.request
import wave

import numpy as np

RATE = 48000
PEAK = 10 ** (-4 / 20)
SOURCES = {
    "sniper.mp3": {
        "author": "Joseph SARDIN / BigSoundBank", "license": "CC0-1.0",
        "page": "https://bigsoundbank.com/shot-of-winchester-magnum-xtr-s0397.html",
        "download": "https://bigsoundbank.com/UPLOAD/mp3/0397.mp3",
        "description": "Outdoor recording of one Winchester Magnum XTR shot.",
    },
    "rifle-real.mp3": {
        "author": "qubodup / public-domain US government training video", "license": "CC0-1.0",
        "page": "https://freesound.org/people/qubodup/sounds/238916/",
        "download": "https://cdn.freesound.org/previews/238/238916_71257-hq.mp3",
        "description": "M16 automatic rifle training recording; final isolated shot is cropped.",
    },
    "grenade-shot.mp3": {
        "author": "qubodup / public-domain US government training video", "license": "CC0-1.0",
        "page": "https://freesound.org/people/qubodup/sounds/162361/",
        "download": "https://cdn.freesound.org/previews/162/162361_71257-hq.mp3",
        "description": "M32 propelled-grenade launch on training grounds.",
    },
    "explosion.mp3": {
        "author": "qubodup / public-domain US government training video", "license": "CC0-1.0",
        "page": "https://freesound.org/people/qubodup/sounds/162363/",
        "download": "https://cdn.freesound.org/previews/162/162363_71257-hq.mp3",
        "description": "Distant grenade detonation on training grounds; short original tail retained.",
    },
    "reload.mp3": {
        "author": "qubodup; edits of CC0 mechanical recordings by serøtōnin", "license": "CC0-1.0",
        "page": "https://freesound.org/people/qubodup/sounds/815879/",
        "download": "https://cdn.freesound.org/previews/815/815879_71257-hq.mp3",
        "description": "Edited real magazine-removal and Ruger 10/22 empty-reload recordings.",
    },
    "casing.mp3": {
        "author": "BlondPanda", "license": "CC0-1.0",
        "page": "https://freesound.org/people/BlondPanda/sounds/778026/",
        "download": "https://cdn.freesound.org/previews/778/778026_8927049-hq.mp3",
        "description": "Real 9mm blank casing hitting a hard surface; Sennheiser MKE600 / EVO8.",
    },
    "forest.mp3": {
        "author": "Joseph SARDIN / BigSoundBank", "license": "CC0-1.0",
        "page": "https://bigsoundbank.com/forest-s0100.html",
        "download": "https://bigsoundbank.com/UPLOAD/mp3/0100.mp3",
        "description": "Real outdoor stereo forest birds, insects and quiet background environment.",
    },
    "leaves-steps.mp3": {
        "author": "Joseph SARDIN / BigSoundBank", "license": "CC0-1.0",
        "page": "https://bigsoundbank.com/feet-in-leaves-s0137.html",
        "download": "https://bigsoundbank.com/UPLOAD/mp3/0137.mp3",
        "description": "Real outdoor footsteps through dry leaves; two separate recorded steps cropped.",
    },
    "water-steps.mp3": {
        "author": "Joseph SARDIN / BigSoundBank", "license": "CC0-1.0",
        "page": "https://bigsoundbank.com/shoes-in-the-water-s0690.html",
        "download": "https://bigsoundbank.com/UPLOAD/mp3/0690.mp3",
        "description": "Real shoes walking in water after a storm; two separate recorded splash steps cropped.",
    },
}


def read_audio(path: Path, channels: int = 1) -> np.ndarray:
    raw = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(path), "-ar", str(RATE),
        "-ac", str(channels), "-f", "f32le", "-",
    ])
    return np.frombuffer(raw, dtype="<f4").reshape(-1, channels).copy()


def cut(audio: np.ndarray, start: float, duration: float) -> np.ndarray:
    return audio[round(start * RATE):round((start + duration) * RATE)].copy()


def attack_start(audio: np.ndarray, lo: float, hi: float) -> float:
    """Find the first strong attack sample and retain 5ms of real preattack."""
    left, right = round(lo * RATE), round(hi * RATE)
    values = np.max(np.abs(audio[left:right]), axis=1)
    hits = np.flatnonzero(values > np.max(values) * .28)
    return max(0, (left + int(hits[0]) - round(.005 * RATE)) / RATE)


def finish(audio: np.ndarray, *, tail: float = .04, normalize: bool = True) -> np.ndarray:
    # A 1ms entrance only removes an edit click, leaving the recorded transient.
    entrance = min(round(.001 * RATE), len(audio))
    audio[:entrance] *= np.linspace(0, 1, entrance)[:, None]
    ending = min(round(tail * RATE), len(audio))
    audio[-ending:] *= np.linspace(1, 0, ending)[:, None]
    if normalize:
        audio *= PEAK / max(float(np.max(np.abs(audio))), 1e-8)
    return audio


def forest_loop(audio: np.ndarray, length: float = 20, overlap: float = 2) -> np.ndarray:
    # Use real, continuous audio for the main bed; equal-power wrap crossfade
    # joins its final two seconds to the recorded beginning without a silence.
    source = cut(audio, 3, length + overlap)
    n = round(overlap * RATE)
    phase = np.linspace(0, np.pi / 2, n, endpoint=False)[:, None]
    blend = source[-n:] * np.cos(phase) + source[:n] * np.sin(phase)
    result = np.concatenate([source[n:-n], blend])
    result *= PEAK / max(float(np.max(np.abs(result))), 1e-8)
    return result


def write_wav(path: Path, audio: np.ndarray) -> dict:
    pcm = np.round(np.clip(audio, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(pcm.shape[1])
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm.tobytes())
    # Re-decode every export with ffmpeg and check PCM peak, duration and data.
    decoded = read_audio(path, pcm.shape[1])
    peak = float(np.max(np.abs(decoded)))
    assert peak <= 10 ** (-3 / 20), (path, peak)
    assert np.isfinite(decoded).all() and len(decoded) > 0
    assert len(decoded) == len(audio)
    win = max(1, round(.001 * RATE))
    mono = np.mean(decoded, axis=1)
    rms = np.sqrt(np.mean(mono[:len(mono) // win * win].reshape(-1, win) ** 2, axis=1))
    strong = np.flatnonzero(rms > max(float(rms.max()) * .18, .004))
    return {
        "duration": round(len(decoded) / RATE, 6), "channels": pcm.shape[1],
        "sampleRate": RATE, "bits": 16, "peakDbFS": round(20 * np.log10(peak), 3),
        "attackMs": int(strong[0]) if len(strong) else None, "bytes": path.stat().st_size,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, info in SOURCES.items():
        path = args.source_dir / name
        if not path.exists():
            request = urllib.request.Request(info["download"], headers={"User-Agent": "Mozilla/5.0"})
            path.write_bytes(urllib.request.urlopen(request, timeout=45).read())

    sniper = read_audio(args.source_dir / "sniper.mp3")
    sniper_at = attack_start(sniper, 1, 1.06)
    rifle = read_audio(args.source_dir / "rifle-real.mp3")
    rifle_at = attack_start(rifle, 2.14, 2.18)
    reload = read_audio(args.source_dir / "reload.mp3")
    bolt_at = attack_start(reload, 1.43, 1.47)
    leaves = read_audio(args.source_dir / "leaves-steps.mp3")
    water_steps = read_audio(args.source_dir / "water-steps.mp3")
    leaves_at = [attack_start(leaves, 1.06, 1.27), attack_start(leaves, 2.7, 2.94)]
    water_at = [attack_start(water_steps, 3.4, 3.64), attack_start(water_steps, 4.24, 4.48)]
    clips = {
        "sniper-1.wav": (finish(cut(sniper, sniper_at, 1.4), tail=.09), "sniper.mp3", sniper_at, "Real shot attack and outdoor echo; level normalized."),
        "rifle-1.wav": (finish(cut(rifle, rifle_at, 1.35), tail=.12), "rifle-real.mp3", rifle_at, "Last single M16 shot cropped from a burst; no additional shot in its tail."),
        "grenade.wav": (finish(read_audio(args.source_dir / "grenade-shot.mp3"), tail=.07), "grenade-shot.mp3", 0, "Full launch recording, natural tail retained."),
        "explosion.wav": (finish(read_audio(args.source_dir / "explosion.mp3"), tail=.03), "explosion.mp3", 0, "Full original detonation recording; its short natural tail is not synthesized or lengthened."),
        "reload.wav": (finish(reload.copy(), tail=.012), "reload.mp3", 0, "Full edited mechanical reload recording."),
        "bolt.wav": (finish(cut(reload, bolt_at, .43), tail=.012), "reload.mp3", bolt_at, "Final real mechanical handling segment from the reload source, used as bolt-cycle foley; attack trimmed to 5ms."),
        "casing.wav": (finish(read_audio(args.source_dir / "casing.mp3"), tail=.03), "casing.mp3", 0, "Full real blank-casing landing recording."),
        "forest.wav": (forest_loop(read_audio(args.source_dir / "forest.mp3", 2)), "forest.mp3", 3, "20-second stereo loop from 22 seconds, with 2-second equal-power wrap crossfade."),
    }
    for number, start in enumerate(leaves_at, 1):
        clips[f"footstep-{number}.wav"] = (finish(cut(leaves, start, .55), tail=.04), "leaves-steps.mp3", start, "One real dry-leaf footstep, cropped with real crunch/rustle tail; no gun-mechanism substitution.")
    for number, start in enumerate(water_at, 1):
        clips[f"water-step-{number}.wav"] = (finish(cut(water_steps, start, .65), tail=.05), "water-steps.mp3", start, "One real shoe-in-water footstep, cropped with natural splash tail.")
    metadata = {}
    for name, (clip, source, start, processing) in clips.items():
        measured = write_wav(args.output_dir / name, clip)
        metadata[name] = {**measured, "source": SOURCES[source], "sourceStart": round(start, 6), "processing": processing}
    manifest = {
        "sniper": ["sniper-1.wav"], "rifle": ["rifle-1.wav"],
        "grenade": ["grenade.wav"], "explosion": ["explosion.wav"],
        "reload": ["reload.wav"], "bolt": ["bolt.wav"],
        "casing": ["casing.wav"], "forest": ["forest.wav"],
        "footstep": ["footstep-1.wav", "footstep-2.wav"],
        "waterStep": ["water-step-1.wav", "water-step-2.wav"],
    }
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (args.output_dir / "SOURCES.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    total = sum(p.stat().st_size for p in args.output_dir.iterdir() if p.is_file())
    assert total < 5_000_000, total
    print(json.dumps({"bytes": total, "clips": {name: {k: value[k] for k in ["duration", "channels", "sampleRate", "peakDbFS", "attackMs"]} for name, value in metadata.items()}}, indent=2))


if __name__ == "__main__":
    main()
