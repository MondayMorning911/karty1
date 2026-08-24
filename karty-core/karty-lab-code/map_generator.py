"""Generate static map image from address using OSM tiles + Pillow."""
import sys
import json
import math
import urllib.request
import io
from PIL import Image, ImageDraw


def lat_lon_to_tile(lat, lon, zoom):
    n = 2 ** zoom
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1/math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def tile_to_lat_lon(x, y, zoom):
    n = 2 ** zoom
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon


def geocode(address: str) -> tuple[float, float] | None:
    """Geocode address using Nominatim."""
    query = urllib.parse.quote(address)
    url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1&countrycodes=ge&accept-language=ru"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'KartyBot/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            if data:
                return float(data[0]['lat']), float(data[0]['lon'])
    except:
        pass
    return None


def generate_map(lat: float, lon: float, zoom: int = 16, width: int = 3, height: int = 2) -> bytes:
    """Generate a static map PNG from coordinates."""
    center_x, center_y = lat_lon_to_tile(lat, lon, zoom)
    tile_size = 256
    img = Image.new('RGB', (tile_size * width, tile_size * height))

    for dx in range(width):
        for dy in range(height):
            x = center_x + dx - width // 2
            y = center_y + dy - height // 2
            url = f"https://tile.openstreetmap.org/{zoom}/{x}/{y}.png"
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'KartyBot/1.0'})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    tile = Image.open(io.BytesIO(resp.read()))
                    img.paste(tile, (tile_size * dx, tile_size * dy))
            except:
                pass

    # Draw red pin at geographic center (tile x, y is top-center of grid)
    draw = ImageDraw.Draw(img)
    cx = tile_size * (width // 2) + tile_size // 2
    cy = tile_size // 2
    
    # Pin shadow
    draw.ellipse([cx-3, cy+8, cx+13, cy+24], fill='#00000066')
    # Pin body
    draw.ellipse([cx-12, cy-12, cx+12, cy+12], fill='#e74c3c', outline='#ffffff', width=3)
    # Inner dot
    draw.ellipse([cx-5, cy-5, cx+5, cy+5], fill='#ffffff')

    # Convert to bytes
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return buf.getvalue()


import urllib.parse

if __name__ == "__main__":
    address = sys.argv[1] if len(sys.argv) > 1 else "Тбилиси, Чавчавадзе 45"
    coords = geocode(address)
    if coords:
        img_bytes = generate_map(coords[0], coords[1])
        with open('/tmp/test_map_gen.png', 'wb') as f:
            f.write(img_bytes)
        print(f"OK: {len(img_bytes)} bytes, coords: {coords}")
    else:
        print("FAIL: geocode failed")
