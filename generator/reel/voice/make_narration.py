"""Speaks a reel's narration and lays it on a timeline the film page can follow.

Usage: python3 -I make_narration.py <model dir> <script.json> <out dir>

Writes one clip per line, narration.wav (the whole track), narration-timing.js (read by the film page)
and narration-report.json. The voice is Kokoro (Apache 2.0), run locally; nothing is sent anywhere.
"""
import json
import pathlib
import sys

import numpy as np
import soundfile as sf
import espeakng_loader
from phonemizer.backend.espeak.wrapper import EspeakWrapper

EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
EspeakWrapper.set_library(espeakng_loader.get_library_path())
from misaki import en, espeak  # noqa: E402
from kokoro_onnx import Kokoro  # noqa: E402

SR = 24000
# Pause before a line, in seconds, by what the picture does at that moment.
GAPS = {"head": 0.45, "same": 0.80, "scene": 0.95, "close": 1.35}
TAIL = 1.9  # the closing card holds this long after the last word

model_dir, script_path, out_dir = (pathlib.Path(p) for p in sys.argv[1:4])
script = json.loads(script_path.read_text(encoding="utf-8"))
(out_dir / "clips").mkdir(parents=True, exist_ok=True)

g2p = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False))
kokoro = Kokoro(str(model_dir / "kokoro-v1.0.onnx"), str(model_dir / "voices-v1.0.bin"))


def tidy(audio):
    """Cut to the speech itself and round off both ends so no clip starts or stops with a click."""
    loud = np.where(np.abs(audio) > 10 ** (-42 / 20))[0]
    audio = audio[max(0, loud[0] - int(0.015 * SR)): loud[-1] + int(0.09 * SR)].astype(np.float64)
    fade_in, fade_out = int(0.012 * SR), int(0.07 * SR)
    audio[:fade_in] *= np.linspace(0, 1, fade_in)
    audio[-fade_out:] *= np.linspace(1, 0, fade_out) ** 2
    return audio


def resumes(audio, shortest=0.18):
    """When the voice starts again after each pause inside a clip, so the picture can follow the sentences."""
    frame = int(0.01 * SR)
    level = np.sqrt((audio[: len(audio) // frame * frame].reshape(-1, frame) ** 2).mean(1))
    quiet = level <= level.max() * 10 ** (-40 / 20)
    found, run = [], 0
    for i, q in enumerate(quiet):
        if q:
            run += 1
        else:
            if run * 0.01 >= shortest and i - run > 0:
                found.append(round(i * 0.01, 2))
            run = 0
    return found


clips, report, cursor = [], [], 0.0
for number, line in enumerate(script["lines"], 1):
    phonemes, _ = g2p(line["say"])
    audio, sr = kokoro.create(phonemes, voice=script["voice"], speed=script["speed"], is_phonemes=True, sentence_pause=0.32, clause_pause=0.12)
    assert sr == SR
    audio = tidy(audio)
    start = cursor + GAPS[line["gap"]]
    end = start + len(audio) / SR
    cursor = end
    sf.write(out_dir / "clips" / f"line-{number}.wav", audio, SR, subtype="PCM_16")
    clips.append((start, audio))
    words = len(line["text"].split())
    report.append({"line": number, "text": line["text"], "phonemes": phonemes, "start": round(start, 3), "end": round(end, 3),
                   "resumes": [round(start + t, 3) for t in resumes(audio)], "seconds": round(len(audio) / SR, 2), "words_per_second": round(words / (len(audio) / SR), 2),
                   "rms_db": round(float(20 * np.log10(np.sqrt(np.mean(audio ** 2)))), 1), "peak_db": round(float(20 * np.log10(np.abs(audio).max())), 1)})

total = np.ceil((cursor + TAIL) * 10) / 10  # a whole tenth of a second, so it is a whole number of frames
track = np.zeros(int(round(total * SR)))
for start, audio in clips:
    at = int(round(start * SR))
    track[at: at + len(audio)] += audio
sf.write(out_dir / "narration.wav", track, SR, subtype="PCM_16")

timing = {"total": float(total), "lines": [{"start": r["start"], "end": r["end"], "resumes": r["resumes"], "gap": l["gap"]} for r, l in zip(report, script["lines"])]}
(out_dir / "narration-timing.js").write_text("// Written by make_narration.py. The film page times its pictures and words to this.\nwindow.NARRATION = " + json.dumps(timing) + ";\n", encoding="utf-8")
(out_dir / "narration-report.json").write_text(json.dumps({"voice": script["voice"], "speed": script["speed"], "total": float(total), "lines": report}, ensure_ascii=False, indent=1), encoding="utf-8")
for r in report:
    print(f'{r["line"]}  {r["start"]:6.2f}-{r["end"]:6.2f}  resumes {r["resumes"]}  {r["seconds"]:5.2f}s  {r["words_per_second"]:.2f} w/s  rms {r["rms_db"]} dB  peak {r["peak_db"]} dB  {r["text"]}')
print("total", float(total))
