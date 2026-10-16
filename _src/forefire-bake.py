"""Assa a paisagem da simulação ao vivo a partir de dados abertos.

Combustível: ESA WorldCover 10 m v200 (CC-BY 4.0), lido direto do COG no S3.
Relevo: AWS Terrain Tiles (Terrarium), zoom 14.
Preview: mosaico da Esri World Imagery só pra conferir aqui (não vai pro site).

uso: python bake.py preview <nome> <lat> <lon> ...
     python bake.py bake <lat> <lon> <saida.bin>
"""
import io, math, sys, urllib.request
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from PIL import Image

W, H, NX, NY = 3200.0, 1800.0, 240, 135
WC = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{}_Map.tif"
# WorldCover -> índice da tabela de combustível (5 maquis/arbusto, 4 capim, 0 sem combustível)
CLASS2FUEL = {10: 5, 20: 5, 30: 4, 40: 4, 50: 0, 60: 0, 70: 0, 80: 0, 90: 0, 95: 0, 100: 4}
NAMES = {10: "árvores", 20: "arbustos", 30: "campo", 40: "cultivo", 50: "urbano", 60: "solo nu", 80: "água", 90: "brejo"}


def bbox(lat0, lon0):
    mlon = 111320 * math.cos(math.radians(lat0))
    return (lon0 - W / 2 / mlon, lat0 - H / 2 / 111320, lon0 + W / 2 / mlon, lat0 + H / 2 / 111320)


def cell_centres(lat0, lon0):
    w, s, e, n = bbox(lat0, lon0)
    xs = w + (np.arange(NX) + 0.5) / NX * (e - w)
    ys = s + (np.arange(NY) + 0.5) / NY * (n - s)  # y crescendo pro norte
    return np.meshgrid(xs, ys)


def worldcover(lat0, lon0):
    tlat = int(math.floor(lat0 / 3) * 3)
    tlon = int(math.floor(lon0 / 3) * 3)
    tile = f"N{tlat:02d}E{tlon:03d}"
    w, s, e, n = bbox(lat0, lon0)
    with rasterio.open(WC.format(tile)) as src:
        win = from_bounds(w, s, e, n, src.transform).round_offsets().round_lengths()
        data = src.read(1, window=win)
        tr = src.window_transform(win)
    lons, lats = cell_centres(lat0, lon0)
    col = ((lons - tr.c) / tr.a).astype(int).clip(0, data.shape[1] - 1)
    row = ((lats - tr.f) / tr.e).astype(int).clip(0, data.shape[0] - 1)
    return data[row, col]


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "antonioleblanc.com bake script"})
    return urllib.request.urlopen(req, timeout=30).read()


def mosaic(lat0, lon0, z, url_fmt):
    w, s, e, n = bbox(lat0, lon0)
    x0, y0 = tile_xy(n, w, z)
    x1, y1 = tile_xy(s, e, z)
    tiles = {}
    for tx in range(int(x0), int(x1) + 1):
        for ty in range(int(y0), int(y1) + 1):
            tiles[(tx, ty)] = Image.open(io.BytesIO(fetch(url_fmt.format(z=z, x=tx, y=ty)))).convert("RGB")
    return tiles, (int(x0), int(y0))


def elevation(lat0, lon0):
    z = 14
    tiles, (ox, oy) = mosaic(lat0, lon0, z, "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png")
    lons, lats = cell_centres(lat0, lon0)
    out = np.zeros(lons.shape, dtype=np.float64)
    for j in range(NY):
        for i in range(NX):
            fx, fy = tile_xy(lats[j, i], lons[j, i], z)
            tx, ty = int(fx), int(fy)
            px, py = int((fx - tx) * 256), int((fy - ty) * 256)
            r, g, b = tiles[(tx, ty)].getpixel((px, py))
            out[j, i] = r * 256 + g + b / 256 - 32768
    return out


def imagery(lat0, lon0, z=15):
    tiles, (ox, oy) = mosaic(lat0, lon0, z, "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}")
    w, s, e, n = bbox(lat0, lon0)
    xs = [k[0] for k in tiles]; ys = [k[1] for k in tiles]
    big = Image.new("RGB", ((max(xs) - ox + 1) * 256, (max(ys) - oy + 1) * 256))
    for (tx, ty), im in tiles.items():
        big.paste(im, ((tx - ox) * 256, (ty - oy) * 256))
    x0, y0 = tile_xy(n, w, z); x1, y1 = tile_xy(s, e, z)
    crop = big.crop((int((x0 - ox) * 256), int((y0 - oy) * 256), int((x1 - ox) * 256), int((y1 - oy) * 256)))
    return crop.resize((960, 540))


def preview(name, lat0, lon0):
    wc = worldcover(lat0, lon0)
    alt = elevation(lat0, lon0)
    vals, counts = np.unique(wc, return_counts=True)
    comp = ", ".join(f"{NAMES.get(v, v)} {100 * c / wc.size:.0f}%" for v, c in sorted(zip(vals, counts), key=lambda t: -t[1]))
    print(f"{name} ({lat0},{lon0}): alt {alt.min():.0f}..{alt.max():.0f} m | {comp}")
    img = imagery(lat0, lon0)
    fuel = np.vectorize(lambda c: CLASS2FUEL.get(int(c), 0))(wc)
    col = np.zeros((NY, NX, 3), np.uint8)
    col[fuel == 5] = (40, 160, 60); col[fuel == 4] = (220, 200, 80); col[fuel == 0] = (90, 90, 140)
    ov = Image.fromarray(col[::-1]).resize((960, 540), Image.NEAREST)
    both = Image.new("RGB", (960, 1080)); both.paste(img, (0, 0)); both.paste(ov, (0, 540))
    both.save(f"prev-{name}.jpg", quality=80)


def bake(lat0, lon0, out):
    wc = worldcover(lat0, lon0)
    alt = elevation(lat0, lon0)
    fuel = np.vectorize(lambda c: CLASS2FUEL.get(int(c), 0))(wc).astype(np.uint8)
    with open(out, "wb") as f:
        f.write(fuel.tobytes())                                 # NY*NX uint8, linha 0 = sul
        f.write(np.round(alt).astype("<i2").tobytes())          # NY*NX int16, metros
    print(out, fuel.size, "células", f"alt {alt.min():.0f}..{alt.max():.0f}", "bbox", bbox(lat0, lon0))


if __name__ == "__main__":
    if sys.argv[1] == "preview":
        a = sys.argv[2:]
        for k in range(0, len(a), 3):
            preview(a[k], float(a[k + 1]), float(a[k + 2]))
    else:
        bake(float(sys.argv[2]), float(sys.argv[3]), sys.argv[4])
