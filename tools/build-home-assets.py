"""Build customer-app home assets from public/brand/apolo-logo.png.

Outputs:
  public/brand/home-statue-hero.png    marble bust, transparent bg, for the navy hero card
  public/brand/home-statue-header.png  same bust very faint, for the white app header
"""
from PIL import Image, ImageOps

SRC = 'public/brand/apolo-logo.png'
HERO_OUT = 'public/brand/home-statue-hero.png'
HEADER_OUT = 'public/brand/home-statue-header.png'

logo = Image.open(SRC).convert('RGB')
W, H = logo.size
print('logo', logo.size)


def is_white(px, tol=245):
    return px[0] >= tol and px[1] >= tol and px[2] >= tol


# border band thickness (same detection as tools/build-receta-assets.py)
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
if not band:
    raise SystemExit('border band detection failed')
print('border band:', band)

# statue bust above the FARMACIA text, trimmed (same crop as the receta watermark)
bust = logo.crop((band + 10, band, W - band - 10, 570))
gray = ImageOps.grayscale(bust)
inv = ImageOps.invert(gray)
bbox = inv.point(lambda p: 255 if p > 18 else 0).getbbox()
if bbox:
    bust = bust.crop(bbox)
print('bust trimmed ->', bust.size)


def keyed(bust, alpha_gain, alpha_cap, lighten):
    """Marble bust on transparent bg: alpha keyed on distance from white."""
    src = bust.load()
    out = Image.new('RGBA', bust.size)
    dst = out.load()
    for y in range(bust.size[1]):
        for x in range(bust.size[0]):
            r, g, b = src[x, y]
            a = int(min(255, (255 - min(r, g, b)) * alpha_gain))
            a = min(a, alpha_cap)
            if lighten:
                r = int(r + (255 - r) * lighten)
                g = int(g + (255 - g) * lighten)
                b = int(b + (255 - b) * lighten)
            dst[x, y] = (r, g, b, a)
    return out


# hero: mostly-solid marble, lifted so it reads on the navy gradient
hero = keyed(bust, alpha_gain=2.0, alpha_cap=235, lighten=0.30)
hero.thumbnail((760, 760), Image.LANCZOS)
hero.save(HERO_OUT, optimize=True)
print('hero ->', HERO_OUT, hero.size)

# header: faint watermark for the white header
head = keyed(bust, alpha_gain=0.55, alpha_cap=48, lighten=0.0)
head.thumbnail((520, 520), Image.LANCZOS)
head.save(HEADER_OUT, optimize=True)
print('header ->', HEADER_OUT, head.size)
