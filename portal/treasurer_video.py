"""Tómbola semanal. Autor: Luis Montañez Escobar."""
import math
from functools import lru_cache
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter
from PIL.PngImagePlugin import PngInfo

ROOT = Path(__file__).resolve().parents[1]
SIZE, FPS, DURATION = 720, 24, 14
VIDEO_STYLE = 'tombola-v1'
SCALE = 2
CREAM, INK, GOLD = '#f4f0e7', '#142f31', '#d9ad59'
MUTED, RED = '#687970', '#b94737'


def ease(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


def box(values):
    return tuple(round(v * SCALE) for v in values)


@lru_cache(maxsize=96)
def face(kind, size):
    name = 'BarlowCondensed-Bold.ttf' if kind == 'bold' else 'Barlow-Regular.ttf'
    return ImageFont.truetype(str(ROOT / 'assets/fonts' / name), round(size * SCALE))


def text(image, xy, value, size, fill=INK, kind='regular', anchor='mm', max_width=None):
    pen = ImageDraw.Draw(image)
    if max_width is not None:
        while size > 12 and pen.textlength(str(value), font=face(kind, size)) > max_width * SCALE:
            size -= 1
    pen.text(box(xy), str(value), font=face(kind, size), fill=fill, anchor=anchor)


def opacity(layer, amount):
    amount = max(0.0, min(1.0, amount))
    if amount >= 1:
        return layer
    result = layer.copy()
    result.putalpha(result.getchannel('A').point(lambda a: round(a * amount)))
    return result


@lru_cache(maxsize=1)
def rounded_shadow(bounds, radius, blur=12, alpha=35, offset=7):
    shadow = Image.new('RGBA', (SIZE * SCALE, SIZE * SCALE))
    ImageDraw.Draw(shadow).rounded_rectangle(box((bounds[0], bounds[1] + offset, bounds[2], bounds[3] + offset)), radius=round(radius * SCALE), fill=(20, 47, 49, alpha))
    return shadow.filter(ImageFilter.GaussianBlur(blur * SCALE))


@lru_cache(maxsize=8)
def mascot_image(height=140):
    path = ROOT / 'assets/mascotas/ajolote-tesorero.png'
    if not path.is_file():
        return None
    art = Image.open(path).convert('RGBA')
    art.thumbnail((height * SCALE, height * SCALE), Image.Resampling.LANCZOS)
    return art


@lru_cache(maxsize=1)
def backdrop():
    image = Image.new('RGBA', (SIZE * SCALE, SIZE * SCALE), CREAM)
    pen = ImageDraw.Draw(image)
    # Trama discreta de imprenta y filetes de la identidad del portal.
    for x in range(26, 700, 18):
        for y in list(range(174, 226, 18)) + list(range(478, 556, 18)):
            if x < 122 or x > 598:
                pen.ellipse(box((x, y, x + 1.4, y + 1.4)), fill='#dedbd0')
    pen.line(box((40, 157, 680, 157)), fill='#dad9cd', width=2)
    pen.line(box((40, 699, 680, 699)), fill='#dad9cd', width=2)
    return image


@lru_cache(maxsize=1)
def machine_back():
    image = Image.new('RGBA', (SIZE * SCALE, SIZE * SCALE))
    pen = ImageDraw.Draw(image)
    # Soporte y eje; el globo contiene balones, sin sectores ni puntero.
    pen.ellipse(box((190, 534, 530, 566)), fill=(20, 47, 49, 18))
    pen.polygon([box(p) for p in [(280, 464), (440, 464), (474, 521), (246, 521)]], fill=INK)
    pen.rounded_rectangle(box((176, 505, 544, 556)), radius=16 * SCALE, fill=INK)
    pen.rounded_rectangle(box((192, 510, 528, 514)), radius=2 * SCALE, fill=GOLD)
    pen.rounded_rectangle(box((261, 523, 459, 545)), radius=5 * SCALE, fill='#25484a')
    text(image, (360, 533), 'LA QUINIELA FISCALIZADA', 17, GOLD, 'bold')
    for x in (183, 537):
        pen.ellipse(box((x - 17, 323, x + 17, 357)), fill=INK)
        pen.ellipse(box((x - 10, 330, x + 10, 350)), fill=GOLD)
        pen.ellipse(box((x - 3, 337, x + 3, 343)), fill='#9a7541')
    pen.ellipse(box((190, 169, 530, 509)), fill=(211, 231, 222, 100), outline=(20, 47, 49, 35), width=4 * SCALE)
    pen.ellipse(box((204, 183, 516, 495)), outline=(255, 255, 255, 140), width=2 * SCALE)
    return image


@lru_cache(maxsize=1)
def machine_front():
    image = Image.new('RGBA', (SIZE * SCALE, SIZE * SCALE))
    pen = ImageDraw.Draw(image)
    pen.ellipse(box((190, 169, 530, 509)), outline=INK, width=5 * SCALE)
    pen.arc(box((205, 184, 515, 494)), start=201, end=267, fill=(255, 255, 255, 220), width=9 * SCALE)
    pen.arc(box((218, 197, 502, 481)), start=206, end=245, fill=(255, 255, 255, 140), width=3 * SCALE)
    pen.arc(box((200, 179, 520, 499)), start=18, end=66, fill=(255, 255, 255, 175), width=4 * SCALE)
    # Conducto de salida frontal.
    pen.rounded_rectangle(box((326, 463, 394, 524)), radius=14 * SCALE, fill=INK)
    pen.rounded_rectangle(box((335, 471, 385, 514)), radius=10 * SCALE, fill='#0c2325', outline=GOLD, width=2 * SCALE)
    pen.line(box((342, 518, 378, 518)), fill='#8d754d', width=3 * SCALE)
    return image


@lru_cache(maxsize=256)
def football(index, width):
    """Balones de idéntica forma; el número sólo identifica al participante."""
    width = round(width)
    canvas = Image.new('RGBA', (round(width * 1.26) * SCALE, round(width * .91) * SCALE))
    cx, cy = canvas.width / 2, canvas.height / 2
    w, h = width * SCALE, width * .57 * SCALE
    points = []
    for upper in (True, False):
        sequence = range(81) if upper else range(80, -1, -1)
        for number in sequence:
            u = number / 80
            points.append((cx - w / 2 + u * w, cy + (-1 if upper else 1) * h / 2 * math.sin(math.pi * u) ** .78))
    mask = Image.new('L', canvas.size)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    shadow = Image.new('RGBA', canvas.size)
    shifted = Image.new('L', canvas.size)
    shifted.paste(mask, (0, 4 * SCALE))
    shadow.putalpha(shifted.point(lambda a: a * 40 // 255))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(3 * SCALE)))
    skin = Image.new('RGBA', canvas.size)
    pen = ImageDraw.Draw(skin)
    pen.rectangle((0, 0, canvas.width, canvas.height), fill='#965b3b')
    pen.ellipse((cx - w * .48, cy - h * .56, cx + w * .48, cy + h * .19), fill='#ad7250')
    pen.ellipse((cx - w * .49, cy + h * .12, cx + w * .51, cy + h * .83), fill='#78422e')
    for direction in (-1, 1):
        stripe = cx + direction * w * .335
        pen.line((stripe - h * .13, cy - h / 2, stripe + h * .13, cy + h / 2), fill='#f4e6c8', width=max(2, round(w * .055)))
    pen.line((cx - w * .16, cy - h * .15, cx + w * .16, cy - h * .15), fill='#f7eddb', width=max(2, round(w * .018)))
    for i in range(5):
        x = cx + (i - 2) * w * .055
        pen.line((x, cy - h * .24, x, cy - h * .06), fill='#f7eddb', width=max(2, round(w * .016)))
    skin.putalpha(mask)
    canvas.alpha_composite(skin)
    ImageDraw.Draw(canvas).line(points + [points[0]], fill='#673a29', width=max(2, round(width * .017 * SCALE)), joint='curve')
    label = f'{index + 1:02d}'
    font_size = max(18, round(width * .23))
    ImageDraw.Draw(canvas).text((round(cx), round(cy + h * .23)), label, font=face('bold', font_size), fill='#fff5da', anchor='mm', stroke_width=round(SCALE * .3), stroke_fill='#75412e')
    return canvas


def paste_ball(image, index, center, width, angle=0, alpha=1):
    art = football(index, round(width))
    if angle:
        art = art.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    if alpha < 1:
        art = opacity(art, alpha)
    image.alpha_composite(art, (round(center[0] * SCALE - art.width / 2), round(center[1] * SCALE - art.height / 2)))


def ball_position(index, count, t):
    phase = index * math.tau / count
    x = 102 * math.sin(2.2 * t + phase) + 21 * math.sin(4.1 * t + phase * .7)
    y = 98 * math.cos(2.85 * t + phase * 1.31) + 17 * math.sin(5.3 * t + phase)
    length = math.hypot(x, y)
    if length > 112:
        x *= 112 / length
        y *= 112 / length
    return 360 + x, 338 + y


def legend(draw, final=False):
    source = draw.get('sourceRound') or {}
    return legend_layer(tuple(candidate['name'] for candidate in draw['candidates']), source.get('week'), final)


@lru_cache(maxsize=4)
def legend_layer(names, source_week, final):
    image = Image.new('RGBA', (SIZE * SCALE, SIZE * SCALE))
    n = len(names)
    left, top = (210, 536) if final and n <= 4 else (40, 578 if not final else 526)
    right, bottom = 680, 689
    pen = ImageDraw.Draw(image)
    pen.rounded_rectangle(box((left, top, right, bottom)), radius=14 * SCALE, fill='#ebe9de', outline='#dedacb', width=SCALE)
    title = f'GANADORES DE LA SEMANA {source_week}' if source_week is not None else 'UNA PARTICIPACIÓN POR GANADOR'
    text(image, ((left + right) / 2, top + 20), title, 19, MUTED, 'bold', max_width=right - left - 25)
    columns = 2 if n <= 8 else 4
    if n == 1:
        columns = 1
    rows = math.ceil(n / columns)
    gap = min(36, (bottom - top - 42) / rows)
    cell_width = (right - left - 28) / columns
    size = 24 if n <= 4 else 20 if n <= 8 else 18
    probability = f'{100 / n:g}%'
    for index, name in enumerate(names):
        row, column = divmod(index, columns)
        cx = left + 14 + cell_width * (column + .5)
        cy = top + 43 + gap * (row + .5)
        label = f'{index + 1:02d}  {name} · {probability}'
        text(image, (cx, cy), label, size, INK, 'bold', max_width=cell_width - 12)
    return image


def validate_draw(draw):
    candidates = draw.get('candidates') or []
    index = draw.get('winnerIndex')
    if not candidates or type(index) is not int or not 0 <= index < len(candidates):
        raise ValueError('El resultado del tesorero no está completo.')
    if draw.get('winner', {}).get('id') != candidates[index].get('id'):
        raise ValueError('El balón debe corresponder al tesorero ya elegido.')


@lru_cache(maxsize=4)
def title_frame(week, season, count):
    image = backdrop().copy()
    text(image, (360, 28), 'LA QUINIELA FISCALIZADA', 22, INK, 'bold')
    text(image, (360, 66), f'SEMANA {week:02d} · NFL {season}', 22, MUTED, 'bold')
    text(image, (360, 107), 'LA TÓMBOLA DEL TESORERO', 43, INK, 'bold')
    subtitle = 'Un balón por ganador. Probabilidades iguales.' if count > 1 else 'Un ganador. Un balón. El puesto es suyo.'
    text(image, (360, 140), subtitle, 21, MUTED)
    text(image, (360, 711), 'MISMA PROBABILIDAD PARA TODOS', 13, MUTED, 'bold')
    return image


@lru_cache(maxsize=4)
def result_card(name, count):
    card = Image.new('RGBA', (SIZE * SCALE, SIZE * SCALE))
    card.alpha_composite(rounded_shadow((60, 208, 660, 498), 23, blur=13, alpha=48))
    pen = ImageDraw.Draw(card)
    pen.rounded_rectangle(box((60, 208, 660, 498)), radius=23 * SCALE, fill=INK)
    pen.rounded_rectangle(box((70, 218, 650, 488)), radius=17 * SCALE, outline='#7a7750', width=SCALE)
    text(card, (360, 250), 'TESORERO DE LA SEMANA', 25, GOLD, 'bold')
    text(card, (360, 324), name, 94, '#fff5dd', 'bold', max_width=520)
    pen.line(box((137, 388, 583, 388)), fill='#5b715e', width=SCALE)
    suffix = 'ganadores' if count != 1 else 'ganador'
    text(card, (360, 425), f'{count} {suffix} · {100 / count:g}% para cada persona', 24, '#e3e8d9')
    text(card, (360, 460), 'UN BALÓN POR GANADOR · TODOS IGUALES', 20, GOLD, 'bold')
    return card


def frame(draw, t):
    validate_draw(draw)
    t = max(0.0, min(DURATION, float(t)))
    if t >= 10:
        t = DURATION
    n, chosen = len(draw['candidates']), draw['winnerIndex']
    image = title_frame(draw['week'], draw['season'], n).copy()
    # La trayectoria representa el resultado almacenado; no obtiene otro ganador.
    machine_alpha = 1 - ease((t - 7.2) / 1.1)
    if machine_alpha > 0:
        scene = machine_back().copy()
        width = 92 if n <= 6 else 78 if n <= 12 else 65
        mix_t = max(0, min(t, 5.5))
        stop = ease((t - 5.5) / .7)
        positions = []
        for index in range(n):
            if index == chosen and t >= 6.2:
                continue
            x, y = ball_position(index, n, mix_t)
            if index == chosen:
                x += (360 - x) * stop
                y += (448 - y) * stop
            angle = 18 * math.sin(mix_t * 3 + index) * (1 - stop)
            positions.append((y, index, (x, y), angle))
        for _, index, position, angle in sorted(positions):
            paste_ball(scene, index, position, width, angle)
        scene.alpha_composite(machine_front())
        image.alpha_composite(opacity(scene, machine_alpha))
    footer_alpha = 1 - ease((t - 6.7) / .6)
    if footer_alpha > 0:
        image.alpha_composite(opacity(legend(draw), footer_alpha))
        art = mascot_image(116)
        if art:
            image.alpha_composite(opacity(art, footer_alpha), (42 * SCALE, 446 * SCALE))
    if 6.2 <= t < 8.4:
        if t < 7.1:
            progress = ease((t - 6.2) / .9)
            center = (360, 448 + 113 * progress)
            width = 92 + 16 * progress
        else:
            progress = ease((t - 7.1) / 1.3)
            center = (360, 561 - 227 * progress)
            width = 108 + 212 * progress
        paste_ball(image, chosen, center, width, math.sin((t - 6.2) * 4) * 4 * (1 - ease((t - 7.1) / 1.2)))
    reveal = ease((t - 8.4) / 1.3)
    if reveal > 0:
        # La tarjeta nace detrás del balón y queda libre durante los últimos 4 s.
        card = result_card(draw['winner']['name'], n)
        scale = .15 + .85 * reveal
        small = card.resize((round(card.width * scale), round(card.height * scale)), Image.Resampling.LANCZOS)
        image.alpha_composite(opacity(small, reveal), ((image.width - small.width) // 2, round((334 * SCALE) * (1 - scale))))
        if reveal < 1:
            art = football(chosen, 320)
            half = art.width // 2
            for direction in (-1, 1):
                piece = art.crop((0 if direction < 0 else half, 0, half if direction < 0 else art.width, art.height))
                piece = piece.rotate(direction * -18 * reveal, resample=Image.Resampling.BICUBIC, expand=True)
                dx = direction * (art.width / (4 * SCALE) + 235 * reveal)
                center = (360 + dx, 334 - 22 * math.sin(reveal * math.pi))
                image.alpha_composite(opacity(piece, 1 - ease((reveal - .5) / .5)), (round(center[0] * SCALE - piece.width / 2), round(center[1] * SCALE - piece.height / 2)))
        # Confeti de trazos geométricos, ajeno al mecanismo de selección.
        confetti = Image.new('RGBA', image.size)
        pen = ImageDraw.Draw(confetti)
        for index in range(24):
            progress = max(0, t - 8.65)
            x = 35 + (index * 139) % 650 + 15 * math.sin(index + progress)
            y = 180 + (index * 43) % 300 + 42 * progress
            if 205 < x < 655 and 205 < y < 505:
                continue
            color = ('#d9ad59', '#648c7a', '#b96951')[index % 3]
            pen.line(box((x, y, x + 5, y + 9)), fill=color, width=3 * SCALE)
        image.alpha_composite(opacity(confetti, reveal * (1 - ease((t - 12.5) / 1.5))))
        final_alpha = ease((t - 9.3) / .7)
        image.alpha_composite(opacity(legend(draw, final=True), final_alpha))
        if n <= 4:
            art = mascot_image(155)
            if art:
                image.alpha_composite(opacity(art, final_alpha), (42 * SCALE, 520 * SCALE))
    if draw.get('sandbox'):
        badge = Image.new('RGBA', image.size)
        pen = ImageDraw.Draw(badge)
        pen.rounded_rectangle(box((16, 16, 130, 43)), radius=7 * SCALE, fill=RED)
        text(badge, (73, 29), 'PRUEBA', 21, '#ffffff', 'bold')
        image.alpha_composite(badge)
    return image.convert('RGB').resize((SIZE, SIZE), Image.Resampling.BOX)


def render_video(draw, path):
    validate_draw(draw)
    path = Path(path)
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
               '-pix_fmt', 'rgb24', '-s', f'{SIZE}x{SIZE}', '-r', str(FPS), '-i', '-', '-an',
               '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
               '-movflags', '+faststart', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-metadata', 'encoder=', '-metadata', 'artist=Luis Montañez Escobar',
               '-metadata', f'title={"PRUEBA - " if draw.get("sandbox") else ""}Tómbola - Tesorero de la semana {draw["week"]}', str(path)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        # Los últimos cuatro segundos conservan el anuncio completo, sin movimiento.
        ending = frame(draw, DURATION).tobytes()
        for i in range(FPS * DURATION):
            process.stdin.write(ending if i >= 10 * FPS else frame(draw, i / FPS).tobytes())
        process.stdin.close()
        error = process.stderr.read()
        if process.wait(timeout=90):
            raise RuntimeError('No se pudo codificar el video: ' + error.decode(errors='replace')[-300:])
    except Exception:
        process.kill()
        process.wait()
        raise
    finally:
        process.stderr.close()
    poster = path.parent / 'poster.png'
    metadata = PngInfo()
    metadata.add_text('Author', 'Luis Montañez Escobar')
    frame(draw, DURATION).save(poster, pnginfo=metadata)
    poster.chmod(0o600)
