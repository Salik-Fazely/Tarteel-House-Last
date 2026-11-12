"""Puts the narration on a finished silent film and proves the result is clean.

Usage: python3 -I finish_with_voice.py <silent film.mp4> <narration out dir> <finished.mp4>

1. Masters narration.wav: 48 kHz, both channels, -15 LUFS, peaks held under -2.6 dBFS.
2. Joins it to the picture without re-encoding the picture.
3. Decodes the finished file and compares its sound with the master, sample by sample.

Step 3 exists because ffmpeg's default AAC coder once put a full-scale click into a line of speech.
The author cannot hear, so the check is arithmetic: the 'fast' coder at 256k is used and verified.
"""
import pathlib
import re
import subprocess
import sys

import numpy as np
import soundfile as sf

film, out, finished = (pathlib.Path(p) for p in sys.argv[1:4])
TARGET_LUFS, CEILING = -15.0, 0.74


def run(*args):
    return subprocess.run(["ffmpeg", "-y", "-hide_banner", "-nostats", *map(str, args)], check=True, capture_output=True, text=True).stderr


def loudness(path):
    summary = run("-i", path, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-").split("Summary:")[-1]
    return float(re.search(r"I:\s+(-?[\d.]+) LUFS", summary).group(1)), float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary).group(1))


def master(gain, path):
    run("-i", out / "narration.wav", "-af", f"aresample=48000,highpass=f=60,volume={gain:.2f}dB,alimiter=limit={CEILING}:attack=5:release=50:level=false,pan=stereo|c0=c0|c1=c0",
        "-c:a", "pcm_s16le", path)


mastered = out / "narration-master.wav"
master(0, mastered)
gain = TARGET_LUFS - loudness(mastered)[0]
master(gain, mastered)

part = finished.with_name(finished.stem + ".part.mp4")
run("-i", film, "-i", mastered, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-aac_coder", "fast", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", part)

decoded = out / "finished-sound.wav"
run("-i", part, "-vn", "-c:a", "pcm_s16le", decoded)
want, sr = sf.read(mastered)
got, _ = sf.read(decoded)
n = min(len(want), len(got))
assert abs(len(want) - len(got)) < sr * 0.05, "the finished sound is not the length of the narration"
lag = max(range(-60, 61), key=lambda k: float(np.dot(np.roll(got[:n, 0], k)[sr: sr * 8], want[sr: sr * 8, 0])))
error = np.roll(got[:n], lag, axis=0)[2000:-2000] - want[:n][2000:-2000]
window = int(0.02 * sr)
loudest = np.sqrt((error[: len(error) // window * window, 0].reshape(-1, window) ** 2).mean(1)).max()
lufs, true_peak = loudness(part)
report = {"gain_db": round(gain, 2), "lufs": lufs, "true_peak_dbfs": true_peak, "sample_peak_dbfs": round(float(20 * np.log10(np.abs(got).max())), 2),
          "worst_sample_error": round(float(np.abs(error).max()), 4), "loudest_20ms_of_error_db": round(float(20 * np.log10(loudest)), 1), "lag_samples": lag}
print(report)
assert report["worst_sample_error"] < 0.02, "the encoder changed the sound: possible click"
assert true_peak <= -1.0, "peaks too close to full scale"
assert abs(lufs - TARGET_LUFS) <= 0.5, "loudness is off target"
part.rename(finished)
print("finished:", finished)
