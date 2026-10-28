"""Tesorero semanal. Autor: Luis Montañez Escobar."""
import hashlib
import json
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from flask import abort, g, jsonify, request, send_file


def register_treasurer(app, db, selected_round, cache_get, audit, admin):
    from portal.treasurer_video import render_video

    root = Path(app.config['DATA_DIR']) / 'treasurer'
    root.mkdir(exist_ok=True, mode=0o700)
    lock = threading.Lock()
    running = set()
    with db() as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS treasurer_draws(
          round_id TEXT PRIMARY KEY REFERENCES rounds(id), payload TEXT NOT NULL,
          status TEXT NOT NULL, video_sha256 TEXT, updated_at TEXT NOT NULL)''')

    def now():
        return datetime.now(timezone.utc).isoformat()

    def check_real():
        if g.user['role'] == 'test':
            abort(403, 'La cuenta de prueba no participa en el sorteo del tesorero.')

    def eligibility(conn, rid):
        target = selected_round(conn, rid)
        # La fuente es la jornada inmediatamente anterior, nunca una futura ni PRE.
        rounds = conn.execute("SELECT * FROM rounds WHERE phase IN ('REG','POST') ORDER BY season,CASE phase WHEN 'REG' THEN 0 ELSE 1 END,week").fetchall()
        ids = [r['id'] for r in rounds]
        index = ids.index(target['id'])
        if not index:
            return target, None, [], 'No hay una jornada anterior con ganadores.'
        source = dict(rounds[index - 1])
        if source['season'] != target['season']:
            return target, source, [], 'No hay una jornada anterior con ganadores en esta temporada.'
        games = conn.execute('SELECT * FROM games WHERE round_id=?', (source['id'],)).fetchall()
        if not games or any(x['status'] != 'final' for x in games):
            return target, source, [], 'El sorteo estará disponible cuando termine la jornada anterior.'
        history_week = source['week'] + (100 if source['phase'] == 'POST' else 0)
        last = conn.execute('SELECT id,payload FROM observations WHERE season=? AND week=? ORDER BY observed_at DESC LIMIT 1', (source['season'], history_week)).fetchone()
        event = json.loads(last['payload']) if last else {}
        if not event.get('settled') or not event.get('winners'):
            return target, source, [], 'Falta confirmar a los ganadores de la jornada anterior.'
        winners = conn.execute('''SELECT w.participant_id,w.name,w.correct FROM round_winners w
          JOIN users u ON u.id=w.participant_id AND u.role!='test'
          WHERE w.season=? AND w.week=? AND w.observation_id=? ORDER BY w.name COLLATE NOCASE,w.participant_id''',
          (source['season'], history_week, last['id'])).fetchall()
        if not winners or {w['participant_id'] for w in winners} != set(event['winners']):
            return target, source, [], 'Falta confirmar a los ganadores de la jornada anterior.'
        count = len(winners)
        candidates = [{'id': w['participant_id'], 'name': w['name'], 'correct': w['correct'], 'probability': 1 / count} for w in winners]
        return target, source, candidates, None

    def files(rid):
        folder = root / rid
        return folder, folder / 'draw.mp4'

    def read(conn, rid):
        row = conn.execute('SELECT * FROM treasurer_draws WHERE round_id=?', (rid,)).fetchone()
        if row:
            data = json.loads(row['payload'])
            data.update(status=row['status'], videoUrl='/api/treasurer/video?round=' + quote(rid) if row['status'] == 'ready' else None,
                        posterUrl='/api/treasurer/poster?round=' + quote(rid) if row['status'] == 'ready' else None)
            return data
        target, source, candidates, reason = eligibility(conn, rid)
        return {'roundId': target['id'], 'week': target['week'], 'season': target['season'],
                'sourceRound': source, 'candidates': candidates, 'winner': None,
                'status': 'unavailable' if reason else 'pending', 'reason': reason, 'videoUrl': None, 'posterUrl': None}

    def start_video(rid):
        with lock:
            if rid in running:
                return
            running.add(rid)

        def work():
            try:
                with app.app_context(), db() as conn:
                    row = conn.execute('SELECT * FROM treasurer_draws WHERE round_id=?', (rid,)).fetchone()
                    if not row or row['status'] == 'ready':
                        return
                    draw = json.loads(row['payload'])
                    conn.execute("UPDATE treasurer_draws SET status='rendering',updated_at=? WHERE round_id=?", (now(), rid))
                folder, video = files(rid)
                folder.mkdir(exist_ok=True, mode=0o700)
                temporary = folder / 'draw.part.mp4'
                app.config.get('TREASURER_RENDERER', render_video)(draw, temporary)
                temporary.chmod(0o600)
                temporary.replace(video)
                sha = hashlib.sha256(video.read_bytes()).hexdigest()
                with app.app_context(), db() as conn:
                    conn.execute("UPDATE treasurer_draws SET status='ready',video_sha256=?,updated_at=? WHERE round_id=?", (sha, now(), rid))
            except Exception:
                app.logger.exception('No se pudo preparar el video del tesorero: %s', rid)
                with app.app_context(), db() as conn:
                    conn.execute("UPDATE treasurer_draws SET status='error',updated_at=? WHERE round_id=?", (now(), rid))
            finally:
                with lock:
                    running.discard(rid)
        threading.Thread(target=work, daemon=True, name='treasurer-video').start()

    @app.get('/api/treasurer')
    def get_treasurer():
        check_real()
        with db() as conn:
            rid = selected_round(conn, request.args.get('round'))['id']
            result = read(conn, rid)
        # Si se interrumpe el servidor, reanudar el mismo video sin nuevo sorteo.
        if result['status'] == 'rendering':
            start_video(rid)
        return jsonify(result)

    @app.post('/api/admin/treasurer/draw')
    @admin
    def draw_treasurer():
        check_real()
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or not isinstance(payload.get('round'), str):
            abort(400, 'Indica la jornada del sorteo.')
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            rid = selected_round(conn, payload['round'])['id']
            result = read(conn, rid)
            if result['status'] == 'unavailable':
                abort(409, result['reason'])
            if result['status'] == 'pending':
                if rid != selected_round(conn)['id']:
                    abort(409, 'Sólo se puede iniciar el sorteo de la jornada vigente.')
                if cache_get(conn, 'round_deadline:' + rid) is None:
                    abort(409, 'La jornada todavía no está habilitada.')
                candidates = result['candidates']
                index = secrets.randbelow(len(candidates))
                result.update(winner=candidates[index], winnerIndex=index, drawnAt=now(), drawnBy=g.user['id'],
                              turns=6, duration=10, method='uniform', status='rendering')
                # La clave única y BEGIN IMMEDIATE impiden dos resultados simultáneos.
                conn.execute('INSERT INTO treasurer_draws VALUES(?,?,?,?,?)', (rid, json.dumps(result, ensure_ascii=False), 'rendering', None, now()))
                audit(conn, g.user['id'], 'treasurer_drawn', {'round': rid, 'source': result['sourceRound']['id'],
                      'candidates': [c['id'] for c in candidates], 'winner': result['winner']['id']})
        if result['status'] in ('rendering', 'error'):
            start_video(rid)
            result['status'] = 'rendering'
        return jsonify(result), 200 if result['status'] == 'ready' else 202

    def media(kind):
        check_real()
        with db() as conn:
            rid = selected_round(conn, request.args.get('round'))['id']
            row = conn.execute('SELECT status FROM treasurer_draws WHERE round_id=?', (rid,)).fetchone()
        if not row or row['status'] != 'ready':
            abort(404, 'El video del sorteo todavía no está disponible.')
        folder, video = files(rid)
        path = video if kind == 'video' else folder / 'poster.png'
        if not path.is_file():
            abort(404, 'El archivo del sorteo no está disponible.')
        response = send_file(path, mimetype='video/mp4' if kind == 'video' else 'image/png', conditional=True,
                             download_name=f'tesorero-{rid}.mp4' if kind == 'video' else f'tesorero-{rid}.png')
        response.headers['Cache-Control'] = 'private, max-age=3600'
        return response

    app.add_url_rule('/api/treasurer/video', 'treasurer_video', lambda: media('video'))
    app.add_url_rule('/api/treasurer/poster', 'treasurer_poster', lambda: media('poster'))

    return read
