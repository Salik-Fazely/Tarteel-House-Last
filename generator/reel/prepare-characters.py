"""Copies the owner's character illustrations for the reel, with three small corrections:
the invented logo on a laptop lid is removed, and the AI-drawn pseudo-Arabic pages and board
are softened so no fake Qur'an text is legible. The originals in assets/Characters are untouched."""
import sys, pathlib
import numpy as np, cv2
from PIL import Image, ImageFilter, ImageDraw

SRC = pathlib.Path(sys.argv[1]); OUT = pathlib.Path(sys.argv[2]); OUT.mkdir(exist_ok=True)

def soften(im, box, radius, feather=18):
    """Blur one region with a feathered edge, like a shallow depth of field."""
    blurred = im.filter(ImageFilter.GaussianBlur(radius))
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=feather, fill=255)
    return Image.composite(blurred, im, mask.filter(ImageFilter.GaussianBlur(feather)))

def remove_lid_logo(im, box):
    """Find the light strokes of the logo on the dark lid and paint them out."""
    a = np.array(im); x0, y0, x1, y1 = box
    region = cv2.cvtColor(a[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY).astype(np.int16)
    lid = int(np.median(region))
    strokes = (region > lid + 14).astype(np.uint8) * 255
    strokes = cv2.dilate(strokes, np.ones((5, 5), np.uint8), iterations=2)
    mask = np.zeros(a.shape[:2], np.uint8); mask[y0:y1, x0:x1] = strokes
    fixed = cv2.inpaint(a, mask, 9, cv2.INPAINT_TELEA)
    print('logo pixels painted out:', int((mask > 0).sum()))
    return Image.fromarray(fixed)

jobs = {
    'adam-04-online-lesson':         lambda im: soften(im, (770, 380, 905, 540), 2.4, 10),
    'teacher-amina-03-online-teaching': lambda im: remove_lid_logo(im, (905, 636, 963, 701)),
    'teacher-amina-04-laptop-screen': lambda im: soften(im, (455, 770, 930, 915), 1.6, 12),
    'maryam-04-online-lesson':       lambda im: soften(im, (880, 965, 1122, 1170), 3.2, 22),
    'maryam-05-writing-practice':    lambda im: im,
}
for name, fix in jobs.items():
    im = fix(Image.open(SRC / f'{name}.png').convert('RGB'))
    im.save(OUT / f'{name}.jpg', quality=93)
    print('wrote', name)
