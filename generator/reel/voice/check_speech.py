"""Listens back to the narration with speech recognition, because the author of the reel cannot hear it.

Usage: python3 -I check_speech.py <whisper model dir> <narration out dir> [<sound of the finished video.wav>]
Prints what was heard for each clip next to what was written, and fails if any word differs
(apart from the spellings of Qur'an and Tarteel, which a recogniser writes its own way).
Given the sound of the finished video, it listens at the times the film was cut to instead,
which proves each line is spoken where the picture expects it.
"""
import json, pathlib, re, sys
import numpy as np, soundfile as sf
import sherpa_onnx

model, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
finished = sf.read(sys.argv[3], dtype="float32") if len(sys.argv) > 3 else None
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=str(model / "small.en-encoder.onnx"), decoder=str(model / "small.en-decoder.onnx"),
                                                tokens=str(model / "small.en-tokens.txt"), language="en", task="transcribe", num_threads=2)
NUMBERS = {"40": "forty", "5": "five", "16": "sixteen", "1": "one"}
SAME = [({"quran", "koran", "qur'an", "kuran", "kuron", "koron", "quraan"}, "quran"), ({"tarteel", "tartil", "tartiel", "tarteal", "tartile", "tarthiel", "tartille", "tarteil"}, "tarteel")]

def words(text):
    text = text.lower().replace("’", "'").replace("one-to-one", "one to one").replace("1-to-1", "one to one")
    text = re.sub(r"\btart\w*\s?h(ou|au)se?\s?(\.|dot )\s?com", "tarteel house dot com", text)  # a recogniser writes the spoken address as a URL
    out = []
    for w in re.findall(r"[a-z0-9']+", text):
        w = NUMBERS.get(w, w)
        for group, name in SAME:
            if w in group: w = name
        out.append(w)
    return out

report = json.loads((out / "narration-report.json").read_text(encoding="utf-8"))
bad = 0
for line in report["lines"]:
    if finished:
        whole, sr = finished
        whole = whole.mean(1) if whole.ndim > 1 else whole
        audio = whole[int((line["start"] - 0.05) * sr): int((line["end"] + 0.05) * sr)]
        outside = whole[int((line["end"] + 0.1) * sr): int((line["end"] + 0.6) * sr)]
        assert np.abs(outside).max() < 0.01, f"line {line['line']} is still being spoken after its window"
    else:
        audio, sr = sf.read(out / "clips" / f"line-{line['line']}.wav", dtype="float32")
    stream = rec.create_stream(); stream.accept_waveform(sr, audio); rec.decode_stream(stream)
    heard = stream.result.text.strip()
    ok = words(heard) == words(line["text"])
    bad += not ok
    print(("ok   " if ok else "DIFF ") + f"{line['line']}  heard: {heard}")
    if not ok: print(f"        wrote: {line['text']}")
print("all lines heard as written" if not bad else f"{bad} line(s) differ")
sys.exit(1 if bad else 0)
