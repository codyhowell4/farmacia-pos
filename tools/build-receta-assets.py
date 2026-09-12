"""Build receta print assets from public/brand/apolo-logo.png.

Outputs:
  public/brand/receta-frame.png     2550x1650 (8.5x5.5in @300dpi) greek-key frame
  public/brand/receta-watermark.png washed-out statue bust for the Rx body
"""
from PIL import Image, ImageOps

SRC = 'public/brand/apolo-logo.png'
FRAME_OUT = 'public/brand/receta-frame.png'
WATER_OUT = 'public/brand/receta-watermark.png'

FRAME_W, FRAME_H = 2550, 1650  # half-letter landscape @300dpi

logo = Image.open(SRC).convert('RGB')
W, H = logo.size
print('logo', logo.size)


def is_white(px, tol=245):
    return px[0] >= tol and px[1] >= tol and px[2] >= tol


# --- detect border band thickness: walk down a column just inside the
# left border (statue doesn't reach there) until a long run of white.
cx = int(W * 0.10)
band = None
run = 0
seen_ink = False
for y in range(H):
    if is_white(logo.getpixel((cx, y))):
        if seen_ink:
            run += 1
            if run >= 40:
                band = y - run + 1
                break
    else:
        seen_ink = True
        run = 0
if not band or band < 10 or band > 150:
    raise SystemExit(f'border band detection failed (band={band})')
print('border band:', band)

# corner block + edge strips from the logo's own border
corner = logo.crop((0, 0, band, band))
top_mid = logo.crop((band, 0, W - band, band))          # horizontal meander
left_mid = logo.crop((0, band, band, H - band))          # vertical meander


def tiled(strip, target_len, horizontal=True):
    """Tile a strip to cover target_len, then stretch to fit exactly."""
    sw, sh = strip.size
    n = max(1, -(-target_len // (sw if horizontal else sh)))
    if horizontal:
        canvas = Image.new('RGB', (sw * n, sh), 'white')
        for i in range(n):
            canvas.paste(strip, (i * sw, 0))
        return canvas.resize((target_len, sh), Image.LANCZOS)
    canvas = Image.new('RGB', (sw, sh * n), 'white')
    for i in range(n):
        canvas.paste(strip, (0, i * sh))
    return canvas.resize((sw, target_len), Image.LANCZOS)


frame = Image.new('RGB', (FRAME_W, FRAME_H), 'white')

# corners (the key-square rosette is rotationally symmetric enough)
frame.paste(corner, (0, 0))
frame.paste(corner.transpose(Image.ROTATE_270), (FRAME_W - band, 0))
frame.paste(corner.transpose(Image.ROTATE_180), (FRAME_W - band, FRAME_H - band))
frame.paste(corner.transpose(Image.ROTATE_90), (0, FRAME_H - band))

# edges
top_edge = tiled(top_mid, FRAME_W - 2 * band, horizontal=True)
frame.paste(top_edge, (band, 0))
frame.paste(top_edge.transpose(Image.ROTATE_180), (band, FRAME_H - band))

left_edge = tiled(left_mid, FRAME_H - 2 * band, horizontal=False)
frame.paste(left_edge, (0, band))
frame.paste(left_edge.transpose(Image.ROTATE_180), (FRAME_W - band, band))

frame.save(FRAME_OUT, optimize=True)
print('frame ->', FRAME_OUT, frame.size)

# --- watermark: statue bust above the "FARMACIA" text, washed out.
# Crop strictly inside the border band; FARMACIA text/dividers start ~y=600.
bust = logo.crop((band + 10, band, W - band - 10, 570))

# auto-trim white margins
gray = ImageOps.grayscale(bust)
inv = ImageOps.invert(gray)
bbox = inv.point(lambda p: 255 if p > 18 else 0).getbbox()
if bbox:
    bust = bust.crop(bbox)
print('bust trimmed ->', bust.size)

# wash out: blend toward white so it prints as a faint watermark
white = Image.new('RGB', bust.size, 'white')
watermark = Image.blend(white, bust, 0.16)

# fade the bottom edge to white so the crop line doesn't show
bw, bh = watermark.size
fade_h = int(bh * 0.30)
gradient = Image.linear_gradient('L').resize((1, fade_h))  # 0 (top) → 255 (bottom)
for yy in range(fade_h):
    a = gradient.getpixel((0, yy)) / 255.0
    row = watermark.crop((0, bh - fade_h + yy, bw, bh - fade_h + yy + 1))
    watermark.paste(Image.blend(row, Image.new('RGB', (bw, 1), 'white'), a),
                    (0, bh - fade_h + yy))

watermark.save(WATER_OUT, optimize=True)
print('watermark ->', WATER_OUT, watermark.size)
