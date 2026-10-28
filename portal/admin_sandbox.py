"""Prueba general aislada de administración. Autor: Luis Montañez Escobar."""
import json
import os
import secrets
import sqlite3
import threading
from datetime import datetime, timedelta, timezone

from flask import abort, g, jsonify, request


def register_admin_sandbox(app, db, directory, selected_round, cache_set, audit, admin):
    folder = directory / 'pruebas-admin'
    path = folder / 'quiniela.sqlite3'
    lock = threading.RLock()

    @app.before_request
    def serialize_sandbox_requests():
        # Un reinicio no puede sustituir la copia a mitad de una operación de prueba.
        if getattr(g, 'admin_sandbox', False) or request.path == '/api/admin/sandbox':
            lock.acquire()
            g.admin_sandbox_locked = True

    @app.teardown_request
    def release_sandbox_lock(error=None):
        if getattr(g, 'admin_sandbox_locked', False):
            g.admin_sandbox_locked = False
            lock.release()

    @app.get('/api/admin/sandbox')
    @admin
    def sandbox_status():
        return jsonify(available=path.is_file())

    @app.post('/api/admin/sandbox')
    @admin
    def sandbox_start():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or type(payload.get('reset', False)) is not bool:
            abort(400, 'Solicitud de prueba inválida.')
        with lock:
            if path.is_file() and not payload.get('reset'):
                return jsonify(ok=True, sandbox=True, created=False)
            if path.is_file():
                with sqlite3.connect(path) as check:
                    jobs = check.execute("SELECT value FROM cache WHERE key LIKE 'treasurer_media_job:%'").fetchall()
                    if (check.execute("SELECT 1 FROM treasurer_draws WHERE status='rendering'").fetchone()
                            or any(json.loads(job[0]).get('status') == 'rendering' for job in jobs)):
                        abort(409, 'Espera a que termine el video de prueba antes de reiniciarla.')
            folder.mkdir(mode=0o700, exist_ok=True)
            temporary = folder / ('preparar-' + secrets.token_hex(8) + '.sqlite3')
            try:
                with db(real=True) as source, sqlite3.connect(temporary) as target:
                    source.backup(target)
                with sqlite3.connect(temporary) as target:
                    target.row_factory = sqlite3.Row
                    target.execute('PRAGMA journal_mode=DELETE')
                    current = selected_round(target)
                    rid = current['id']
                    target.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)', ('admin_sandbox_round', rid))
                    target.execute('DELETE FROM sessions')
                    target.execute('DELETE FROM login_attempts')
                    target.execute('DELETE FROM treasurer_draws WHERE round_id=?', (rid,))
                    target.execute('DELETE FROM cache WHERE key IN (?,?)',
                                   ('treasurer_media_style:' + rid, 'treasurer_media_job:' + rid))
                    # Las elecciones de demostración se crean sólo en esta copia.
                    games = target.execute('SELECT id,away,home FROM games WHERE round_id=? ORDER BY start,id', (rid,)).fetchall()
                    people = target.execute("SELECT id FROM users WHERE active=1 AND role!='test' ORDER BY name,id").fetchall()
                    now = datetime.now(timezone.utc)
                    deadline = now + timedelta(days=7)
                    cache_set(target, 'round_deadline:' + rid, deadline.isoformat())
                    for index, game in enumerate(games):
                        start = (deadline + timedelta(minutes=15 + index * 30)).isoformat()
                        row = target.execute('SELECT payload FROM games WHERE id=?', (game['id'],)).fetchone()
                        game_payload = json.loads(row['payload'])
                        game_payload.update(start=start, date=start, status='scheduled', awayScore=None, homeScore=None, timeTbd=False)
                        target.execute("UPDATE games SET start=?,status='scheduled',away_score=NULL,home_score=NULL,payload=? WHERE id=?",
                                       (start, json.dumps(game_payload), game['id']))
                        for number, person in enumerate(people):
                            choice = (game['away'], game['home'], 'TIE')[(index + number) % 3]
                            target.execute('INSERT INTO picks VALUES(?,?,?,?) ON CONFLICT(user_id,game_id) DO UPDATE SET choice=excluded.choice,updated_at=excluded.updated_at',
                                           (person['id'], game['id'], choice, now.isoformat()))
                    target.execute('DELETE FROM contribution_records WHERE round_id=?', (rid,))
                    target.execute('UPDATE participations SET paid=NULL WHERE round_id=?', (rid,))
                    target.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)', ('admin_sandbox_created', now.isoformat()))
                    audit(target, g.user['id'], 'admin_sandbox_prepared', {'round': rid})
                os.chmod(temporary, 0o600)
                # La copia se publica completa; nunca sustituye la base real.
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
        return jsonify(ok=True, sandbox=True, created=True)

    @app.post('/api/admin/sandbox/scenario')
    @admin
    def sandbox_scenario():
        if not getattr(g, 'admin_sandbox', False):
            abort(403, 'Activa el modo de prueba para simular resultados.')
        payload = request.get_json(silent=True)
        scenario = payload.get('scenario') if isinstance(payload, dict) else None
        if scenario not in ('scheduled', 'live', 'final'):
            abort(400, 'Elige captura abierta, partidos en vivo o resultados finales.')
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            marker = conn.execute("SELECT value FROM metadata WHERE key='admin_sandbox_round'").fetchone()
            if not marker:
                abort(409, 'Reinicia el modo de prueba para simular resultados.')
            current = selected_round(conn, marker['value'])
            rid = current['id']
            games = conn.execute('SELECT id,payload FROM games WHERE round_id=? ORDER BY start,id', (rid,)).fetchall()
            now = datetime.now(timezone.utc)
            deadline = now + timedelta(days=7) if scenario == 'scheduled' else now - timedelta(hours=1)
            cache_set(conn, 'round_deadline:' + rid, deadline.isoformat())
            for index, game in enumerate(games):
                scores = (None, None) if scenario == 'scheduled' else ((24, 17), (17, 24), (20, 20))[index % 3]
                start = deadline + timedelta(minutes=15 + index * 30) if scenario == 'scheduled' else now - timedelta(minutes=60 + index)
                stamp = start.isoformat()
                game_payload = json.loads(game['payload'])
                game_payload.update(start=stamp, date=stamp, status=scenario, awayScore=scores[0], homeScore=scores[1], timeTbd=False)
                conn.execute('UPDATE games SET start=?,status=?,away_score=?,home_score=?,payload=? WHERE id=?',
                             (stamp, scenario, *scores, json.dumps(game_payload), game['id']))
            app.qf['record'](conn, app.qf['state'](conn, rid))
            history_week = current['week'] + (100 if current['phase'] == 'POST' else 0)
            last = conn.execute('SELECT payload FROM observations WHERE season=? AND week=? ORDER BY observed_at DESC LIMIT 1',
                                (current['season'], history_week)).fetchone()
            winners = json.loads(last['payload']).get('winners', []) if last else []
            # Una simulación nueva retira sólo los ganadores de prueba anteriores.
            for row in conn.execute('SELECT participant_id FROM round_winners WHERE season=? AND week=?', (current['season'], history_week)).fetchall():
                if row['participant_id'] not in winners:
                    conn.execute('DELETE FROM round_winners WHERE season=? AND week=? AND participant_id=?',
                                 (current['season'], history_week, row['participant_id']))
            conn.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)', ('admin_sandbox_scenario', scenario))
            audit(conn, g.user['id'], 'admin_sandbox_scenario', {'round': rid, 'scenario': scenario})
        return jsonify(ok=True, sandbox=True, scenario=scenario, round=rid)
