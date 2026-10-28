"""Video del sorteo. Autor: Luis Montañez Escobar."""
import math
from functools import lru_cache
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from PIL.PngImagePlugin import PngInfo

ROOT = Path(__file__).resolve().parents[1]
SIZE, FPS, DURATION = 720, 24, 10
COLORS = ['#e8bd67', '#db8584', '#a8c4ad', '#85abb4', '#c1b0cc', '#dbab81']


@lru_cache(maxsize=32)
def face(kind, size):
    name = 'BarlowCondensed-Bold.ttf' if kind == 'bold' else 'Barlow-Regular.ttf'
    return ImageFont.truetype(str(ROOT / 'assets/fonts' / name), size)


@lru_cache(maxsize=1)
def mascot_image():
    path = ROOT / 'assets/mascotas/ajolote-tesorero.png'
    if not path.exists():
        return None
    art = Image.open(path).convert('RGBA');art.thumbnail((105,115))
    return art


def frame(draw, t):
    image = Image.new('RGB', (SIZE, SIZE), '#f4f0e7')
    pen = ImageDraw.Draw(image)
    font = lambda n: face('bold', n)
    textfont = lambda n: face('regular', n)
    def text(x, y, text, face, fill='#142b30', anchor='mm'):
        pen.text((x, y), text, font=face, fill=fill, anchor=anchor)
    text(360, 30, 'LA QUINIELA FISCALIZADA', font(24))
    text(360, 75, f'TESORERO · SEMANA {draw["week"]}', font(38))
    candidates, index = draw['candidates'], draw['winnerIndex']
    n = len(candidates)
    step = 360 / n
    end = draw.get('turns', 6) * 360 - (index + .5) * step
    progress = max(0, min(1, (t - 1) / 6))
    angle = end * (1 - (1 - progress) ** 4)
    cx, cy, radius = 360, 340, 206
    box = (cx-radius, cy-radius, cx+radius, cy+radius)
    for i, candidate in enumerate(candidates):
        start = -90 + angle + i * step
        pen.pieslice(box, start=start, end=start+step, fill=COLORS[i % len(COLORS)], outline='#f4f0e7', width=3)
        a = math.radians(start + step / 2)
        x, y = cx + math.cos(a)*radius*.62, cy + math.sin(a)*radius*.62
        text(x, y, candidate['name'], font(28 if n <= 6 else 20))
    pen.ellipse(box, outline='#142b30', width=7)
    pen.ellipse((cx-27, cy-27, cx+27, cy+27), fill='#142b30', outline='#f4f0e7', width=3)
    pen.polygon([(cx-17, cy-radius-23), (cx+17, cy-radius-23), (cx, cy-radius+10)], fill='#b94737')
    percent = f'{100/n:g}%'
    text(360, 583, f'{n} ganador' + ('es' if n != 1 else '') + f' · {percent} por persona', textfont(24))
    if t >= 7:
        text(360, 624, draw['winner']['name'], font(49))
        text(360, 670, 'TESORERO DE ESTA SEMANA', font(24))
    else:
        text(360, 635, 'UNA PARTICIPACIÓN POR GANADOR', font(26))
        text(360, 674, 'La misma probabilidad para todos', textfont(22))
    art = mascot_image()
    if art is not None:
        image.paste(art, (14,593), art)
    return image


def render_video(draw, path):
    path = Path(path)
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
               '-pix_fmt', 'rgb24', '-s', f'{SIZE}x{SIZE}', '-r', str(FPS), '-i', '-', '-an',
               '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
               '-movflags', '+faststart', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-metadata', 'encoder=', '-metadata', 'artist=Luis Montañez Escobar',
               '-metadata', f'title=Tesorero de la semana {draw["week"]}', str(path)]
    # Se conservan los fotogramas de esta misma ejecución, sin captura de pantalla ajena.
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for i in range(FPS * DURATION):
            process.stdin.write(frame(draw, i / FPS).tobytes())
        process.stdin.close()
        error = process.stderr.read()
        if process.wait(timeout=90):
            raise RuntimeError('No se pudo codificar el video: ' + error.decode(errors='replace')[-300:])
    except Exception:
        process.kill();process.wait();raise
    finally:
        process.stderr.close()
    poster = path.parent / 'poster.png'
    metadata = PngInfo();metadata.add_text('Author','Luis Montañez Escobar')
    frame(draw, DURATION).save(poster, pnginfo=metadata)
    poster.chmod(0o600)
