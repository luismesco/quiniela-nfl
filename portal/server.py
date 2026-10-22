"""La Quiniela Fiscalizada. Autor: Luis Montañez Escobar."""
from __future__ import annotations

import atexit
import hashlib
import hmac
import io
import json
import os
import secrets
import sqlite3
import threading
import time
import zipfile
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import urlparse

import bcrypt
from flask import Flask, abort, g, jsonify, redirect, request, send_file, send_from_directory
from werkzeug.middleware.proxy_fix import ProxyFix

ROOT = Path(__file__).resolve().parents[1]
AUTHOR = 'Luis Montañez Escobar'
TERMINAL = ('final', 'canceled')


def utcnow():
    return datetime.now(timezone.utc)


def stamp():
    return utcnow().isoformat()


def epoch(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except (TypeError, ValueError, AttributeError):
        return None


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def round_id(season, phase, week):
    return f'{int(season)}-{phase}-{int(week)}'


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(DATA_DIR=os.environ.get('DATA_DIR', str(ROOT / 'portal/private')),
                      SECURE_COOKIES=os.environ.get('SECURE_COOKIES', '1') == '1',
                      MAX_CONTENT_LENGTH=20000, NOW=time.time,
                      BOOTSTRAP_USERS_JSON=os.environ.get('BOOTSTRAP_USERS_JSON', '[]'))
    if config:
        app.config.update(config)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    directory = Path(app.config['DATA_DIR'])
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    app.config['DB'] = str(directory / 'quiniela.sqlite3')

    @contextmanager
    def db():
        conn = sqlite3.connect(app.config['DB'], timeout=25)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute('PRAGMA busy_timeout=25000')
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def cache_set(conn, key, value, at=None):
        conn.execute('INSERT INTO cache VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
                     (key, json.dumps(value, ensure_ascii=False), at or stamp()))

    def cache_get(conn, key, default=None):
        row = conn.execute('SELECT value FROM cache WHERE key=?', (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def audit(conn, actor, action, detail):
        conn.execute('INSERT INTO audit(actor,action,detail,created_at) VALUES(?,?,?,?)',
                     (actor, action, json.dumps(detail, ensure_ascii=False), stamp()))

    def import_games(conn, league):
        if league.get('season') != 2026 or not isinstance(league.get('games'), list):
            raise ValueError('Temporada de calendario inválida')
        for game in league['games']:
            if game.get('phase') not in ('REG', 'PRE', 'POST') or not game.get('week') or not game.get('id'):
                continue
            rid = round_id(league['season'], game['phase'], game['week'])
            conn.execute('INSERT OR IGNORE INTO rounds VALUES(?,?,?,?,?,?)',
                         (rid, league['season'], game['phase'], game['week'], 50, stamp()))
            previous = conn.execute('SELECT status FROM games WHERE id=?', (game['id'],)).fetchone()
            if previous and (previous['status'] == 'final' and game['status'] != 'final' or previous['status'] in ('live','suspended') and game['status']=='scheduled'):
                continue
            conn.execute('''INSERT INTO games VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                start=excluded.start,venue=excluded.venue,neutral=excluded.neutral,status=excluded.status,
                away_score=excluded.away_score,home_score=excluded.home_score,payload=excluded.payload,checked_at=excluded.checked_at''',
                         (game['id'], rid, game['away'], game['home'], game.get('start'), game.get('venue'),
                          int(game.get('neutral', False)), game['status'], game.get('awayScore'),
                          game.get('homeScore'), json.dumps(game), league.get('fetchedAt', stamp())))

    with db() as conn:
        conn.execute('PRAGMA journal_mode=WAL')
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,
            aliases TEXT NOT NULL,password_hash TEXT,role TEXT NOT NULL DEFAULT 'participant',must_change INTEGER NOT NULL DEFAULT 1,
            active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),csrf TEXT NOT NULL,
            expires_at REAL NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS rounds(id TEXT PRIMARY KEY,season INTEGER,phase TEXT,week INTEGER,fee REAL,created_at TEXT);
        CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,round_id TEXT REFERENCES rounds(id),away TEXT,home TEXT,start TEXT,
            venue TEXT,neutral INTEGER,status TEXT,away_score INTEGER,home_score INTEGER,payload TEXT,checked_at TEXT);
        CREATE TABLE IF NOT EXISTS participations(round_id TEXT REFERENCES rounds(id),user_id TEXT REFERENCES users(id),paid INTEGER,
            PRIMARY KEY(round_id,user_id));
        CREATE TABLE IF NOT EXISTS picks(user_id TEXT REFERENCES users(id),game_id TEXT REFERENCES games(id),choice TEXT NOT NULL,
            updated_at TEXT NOT NULL,PRIMARY KEY(user_id,game_id));
        CREATE TABLE IF NOT EXISTS sandbox_picks(user_id TEXT REFERENCES users(id),game_id TEXT REFERENCES games(id),choice TEXT NOT NULL,
            updated_at TEXT NOT NULL,PRIMARY KEY(user_id,game_id));
        CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT REFERENCES users(id),title TEXT,
            body TEXT,created_at TEXT,status TEXT DEFAULT 'new',reply TEXT,read_at TEXT);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT,action TEXT,detail TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS login_attempts(key TEXT,at REAL);
        CREATE INDEX IF NOT EXISTS login_attempt_time ON login_attempts(key,at);
        CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
        CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,season INTEGER,week INTEGER,observed_at TEXT NOT NULL,
            received_at TEXT NOT NULL,live INTEGER,settled INTEGER,pot REAL,payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS participant_scores(observation_id TEXT REFERENCES observations(id),participant_id TEXT,name TEXT,
            correct INTEGER,projected INTEGER,official_rank INTEGER,projected_rank INTEGER,PRIMARY KEY(observation_id,participant_id));
        CREATE TABLE IF NOT EXISTS round_winners(season INTEGER,week INTEGER,observation_id TEXT REFERENCES observations(id),
            participant_id TEXT,name TEXT,correct INTEGER,pot REAL,PRIMARY KEY(season,week,participant_id));
        ''')
        conn.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)',('author',AUTHOR))
        if cache_get(conn, 'seed_imported') is None:
            seed = json.loads((ROOT / 'quiniela.json').read_text())
            league = json.loads((ROOT / 'league.json').read_text())
            scores = json.loads((ROOT / 'scores.json').read_text())
            history = json.loads((ROOT / 'race-history.json').read_text())
            archived = [json.loads(p.read_text()) for p in sorted((ROOT / 'archivo').glob('*/semana-*/quiniela.json'))]
            seed_rounds = archived + [seed]
            cache_set(conn, 'teams', seed['teams'])
            cache_set(conn, 'league', league)
            import_games(conn, league)
            users = {u['id']: u for u in json.loads(app.config['BOOTSTRAP_USERS_JSON'])}
            seed_people = {p['id']: p for record in seed_rounds for p in record['participants']}
            for p in seed_people.values():
                account = users.get(p['id'], {})
                conn.execute('INSERT OR IGNORE INTO users VALUES(?,?,?,?,?,?,?,?,?)',
                             (p['id'], account.get('username', p['name'].lower().replace(' ', '-')),
                              p['name'], json.dumps(p.get('aliases', [])), account.get('password_hash'),
                              'admin' if p['id'] == 'luis' else 'participant', 1, 1, stamp()))
            for record in seed_rounds:
                rid = round_id(record['season'], 'REG', record['week'])
                for p in record['participants']:
                    conn.execute('INSERT OR IGNORE INTO participations VALUES(?,?,?)', (rid, p['id'], p['paid']))
                    for game, choice in p['choices'].items():
                        if not conn.execute('SELECT id FROM games WHERE id=?', (game,)).fetchone():
                            raise ValueError('Elección sin partido en el calendario')
                        conn.execute('INSERT OR IGNORE INTO picks VALUES(?,?,?,?)', (p['id'], game, choice, record['updatedAt']))
            for path in sorted((ROOT / 'archivo').glob('*/semana-*/scores.json')):
                for s in json.loads(path.read_text())['games']:
                    apply_score(conn, s)
            for s in scores['games']:
                apply_score(conn, s)
            ingest_history(conn, history)
            cache_set(conn, 'seed_imported', {'at': stamp(), 'week': seed['week']})
        # Complete initial provisioning after a first deployment with no accounts, without resetting existing passwords.
        for u in json.loads(app.config['BOOTSTRAP_USERS_JSON']):
            conn.execute('UPDATE users SET password_hash=?,username=? WHERE id=? AND password_hash IS NULL',
                         (u['password_hash'], u['username'], u['id']))

    # Persist only the published capture deadline; future calendar rounds stay closed
    # until their own weekly controller supplies one. Never re-import participant data.
    with db() as conn:
        controllers = sorted((ROOT / 'archivo').glob('*/semana-*/quiniela.json')) + [ROOT / 'quiniela.json']
        for path in controllers:
            record = json.loads(path.read_text())
            deadline = record.get('deadline')
            if not epoch(deadline):
                raise ValueError('La jornada publicada necesita una hora de cierre válida')
            rid = round_id(record['season'], record.get('phase', 'REG'), record['week'])
            key = 'round_deadline:' + rid
            if cache_get(conn, key) is None:
                cache_set(conn, key, deadline)

    def capture_deadline(conn, rid):
        return cache_get(conn, 'round_deadline:' + rid)

    def game_closes_at(start, deadline, sandbox=False):
        times = (epoch(start),) if sandbox else (epoch(start), epoch(deadline))
        if any(value is None for value in times):
            return None
        return datetime.fromtimestamp(min(times), timezone.utc).isoformat()

    def user_json(user):
        return {'id': user['id'], 'name': user['name'], 'username': user['username'],
                'role': user['role'], 'mustChange': bool(user['must_change'])}

    @app.before_request
    def identity():
        g.user = None
        g.session = None
        token = request.cookies.get('qf_session', '')
        if token:
            with db() as conn:
                row = conn.execute('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?',
                                   (digest(token), app.config['NOW']())).fetchone()
                if row:
                    user = conn.execute('SELECT * FROM users WHERE id=? AND active=1', (row['user_id'],)).fetchone()
                    if user:
                        g.user, g.session = dict(user), dict(row)
        if request.path.startswith('/api/') and request.path != '/api/login':
            if not g.user:
                abort(401, 'Inicia sesión para continuar.')
            if g.user['must_change'] and request.path not in ('/api/me', '/api/password', '/api/logout'):
                abort(428, 'Elige tu contraseña personal para continuar.')
        if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            origin = request.headers.get('Origin')
            if origin and urlparse(origin).netloc != request.host:
                abort(403, 'Solicitud de otro sitio no permitida.')
            if request.path != '/api/login':
                if not g.session or not hmac.compare_digest(request.headers.get('X-CSRF-Token', ''), g.session['csrf']):
                    abort(403, 'Tu sesión cambió. Recarga la página.')

    @app.after_request
    def headers(response):
        response.headers.update({'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
                                 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
                                 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"})
        if request.path.startswith('/api/') or request.path == '/':
            response.headers['Cache-Control'] = 'no-store'
        if app.config['SECURE_COOKIES']:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000'
        return response

    @app.errorhandler(Exception)
    def error(exc):
        from werkzeug.exceptions import HTTPException
        if isinstance(exc, HTTPException):
            return jsonify(error=exc.description), exc.code
        app.logger.error('Error de aplicación: %s', type(exc).__name__)
        return jsonify(error='No pudimos completar la solicitud. Inténtalo de nuevo.'), 500

    def admin(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            if not g.user or g.user['role'] != 'admin':
                abort(403, 'Esta sección es para Luis, administrador.')
            return fn(*args, **kwargs)
        return wrapped

    def body():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            abort(400, 'Solicitud inválida.')
        return data

    def session_start(conn, user_id):
        token, csrf = secrets.token_urlsafe(40), secrets.token_urlsafe(28)
        conn.execute('DELETE FROM sessions WHERE expires_at<?', (app.config['NOW'](),))
        conn.execute('INSERT INTO sessions VALUES(?,?,?,?,?)',
                     (digest(token), user_id, csrf, app.config['NOW']() + 7*86400, stamp()))
        return token, csrf

    def cookie(response, token):
        response.set_cookie('qf_session', token, max_age=7*86400, secure=app.config['SECURE_COOKIES'],
                            httponly=True, samesite='Lax', path='/')
        return response

    @app.post('/api/login')
    def login():
        data = body()
        username, password = str(data.get('username', '')).strip().lower()[:80], str(data.get('password', ''))
        if not 1 <= len(password.encode()) <= 72:
            abort(401, 'Usuario o contraseña incorrectos.')
        at = app.config['NOW']()
        ip_key = digest('ip:' + (request.remote_addr or ''))
        user_key = digest('user:' + username)
        with db() as conn:
            conn.execute('DELETE FROM login_attempts WHERE at<?', (at-3600,))
            if any(conn.execute('SELECT count(*) FROM login_attempts WHERE key=? AND at>?', (key, at-900)).fetchone()[0] >= limit
                   for key, limit in ((ip_key, 60), (user_key, 10))):
                abort(429, 'Demasiados intentos. Espera 15 minutos e inténtalo nuevamente.')
            user = conn.execute('SELECT * FROM users WHERE username=? AND active=1', (username,)).fetchone()
            valid = user and user['password_hash'] and bcrypt.checkpw(password.encode(), user['password_hash'].encode())
            if not valid:
                for key in (ip_key, user_key):
                    conn.execute('INSERT INTO login_attempts VALUES(?,?)', (key, at))
                # Commit failures before returning the generic response.
                return jsonify(error='Usuario o contraseña incorrectos.'), 401
            conn.execute('DELETE FROM login_attempts WHERE key=?', (user_key,))
            token, csrf = session_start(conn, user['id'])
            audit(conn, user['id'], 'login', {})
            return cookie(jsonify(user=user_json(user), csrf=csrf), token)

    @app.get('/api/me')
    def me():
        return jsonify(user=user_json(g.user), csrf=g.session['csrf'])

    @app.post('/api/logout')
    def logout():
        with db() as conn:
            conn.execute('DELETE FROM sessions WHERE token_hash=?', (g.session['token_hash'],))
        response = jsonify(ok=True)
        response.delete_cookie('qf_session', path='/', secure=app.config['SECURE_COOKIES'], httponly=True, samesite='Lax')
        return response

    @app.post('/api/password')
    def password():
        data = body()
        old, new = str(data.get('current', '')), str(data.get('password', ''))
        if not 10 <= len(new) or len(new.encode()) > 72:
            abort(400, 'Usa entre 10 y 72 caracteres para tu contraseña.')
        if not 1 <= len(old.encode()) <= 72 or not bcrypt.checkpw(old.encode(), g.user['password_hash'].encode()):
            abort(400, 'La contraseña actual no coincide.')
        if new == old:
            abort(400, 'Elige una contraseña distinta a la temporal.')
        hashed = bcrypt.hashpw(new.encode(), bcrypt.gensalt(rounds=12)).decode()
        with db() as conn:
            conn.execute('UPDATE users SET password_hash=?,must_change=0 WHERE id=?', (hashed, g.user['id']))
            conn.execute('DELETE FROM sessions WHERE user_id=?', (g.user['id'],))
            token, csrf = session_start(conn, g.user['id'])
            audit(conn, g.user['id'], 'password_changed', {})
        return cookie(jsonify(ok=True, csrf=csrf), token)

    def selected_round(conn, requested=None):
        if requested:
            row = conn.execute('SELECT * FROM rounds WHERE id=?', (requested,)).fetchone()
            if not row:
                abort(404, 'No existe esa jornada.')
            return dict(row)
        rows = conn.execute('''SELECT r.* FROM rounds r WHERE r.phase IN ('REG','POST') AND EXISTS
              (SELECT 1 FROM games g WHERE g.round_id=r.id AND g.status NOT IN ('final','canceled') AND g.start IS NOT NULL)
              ORDER BY r.season,CASE r.phase WHEN 'REG' THEN 0 ELSE 1 END,r.week''').fetchall()
        if rows:
            return dict(rows[0])
        row = conn.execute("SELECT * FROM rounds WHERE phase='REG' ORDER BY season DESC,week DESC LIMIT 1").fetchone()
        return dict(row)

    def state(conn, rid, sandbox=False):
        r = selected_round(conn, rid)
        deadline = capture_deadline(conn, r['id'])
        now = app.config['NOW']()
        games = []
        for row in conn.execute('SELECT * FROM games WHERE round_id=? ORDER BY start,id', (r['id'],)):
            game = json.loads(row['payload'])
            game.update(id=row['id'], away=row['away'], home=row['home'], start=row['start'], venue=row['venue'],
                        neutral=bool(row['neutral']), status=row['status'], awayScore=row['away_score'], homeScore=row['home_score'], checkedAt=row['checked_at'])
            game['closesAt'] = game_closes_at(row['start'], deadline, sandbox)
            game['locked'] = bool(game.get('timeTbd')) or row['status'] != 'scheduled' or not game['closesAt'] or now >= epoch(game['closesAt'])
            games.append(game)
        participants = []
        for user in conn.execute("SELECT * FROM users WHERE active=1 AND role!='test' ORDER BY name COLLATE NOCASE"):
            paid = conn.execute('SELECT paid FROM participations WHERE round_id=? AND user_id=?', (r['id'], user['id'])).fetchone()
            choices = {v['game_id']: v['choice'] for v in conn.execute('''SELECT p.game_id,p.choice FROM picks p JOIN games g ON g.id=p.game_id
                          WHERE p.user_id=? AND g.round_id=?''', (user['id'], r['id']))}
            participants.append({'id': user['id'], 'name': user['name'], 'aliases': json.loads(user['aliases']),
                                 'paid': None if not paid or paid['paid'] is None else bool(paid['paid']), 'choices': choices})
        return {'schema': 1, 'author': AUTHOR, 'roundId': r['id'], 'season': r['season'], 'phase': r['phase'], 'week': r['week'],
                'fee': r['fee'], 'currency': 'MXN', 'updatedAt': stamp(), 'teams': cache_get(conn, 'teams'),
                'deadline': deadline, 'captureRule': 'per-game' if sandbox else 'weekly',
                'captureClosed': all(game['locked'] for game in games) if sandbox else not epoch(deadline) or now >= epoch(deadline),
                'games': games, 'participants': participants, 'demo': False}

    def record_state(conn, data):
        games, participants = data['games'], data['participants']
        if not games:
            return
        phase = data.get('phase', 'REG')
        key = digest(json.dumps({'games': [(g['id'],g['status'],g.get('awayScore'),g.get('homeScore'),g['start']) for g in games],
                                 'participants': [(p['id'],p['choices']) for p in participants], 'fee': data['fee']}, sort_keys=True))
        latest = conn.execute('SELECT payload FROM observations WHERE season=? AND week=? ORDER BY observed_at DESC LIMIT 1',
                              (data['season'], data['week'] if phase=='REG' else data['week']+100)).fetchone()
        if latest and json.loads(latest[0]).get('stateKey') == key:
            return
        results = {g['id']: ('TIE' if g['awayScore']==g['homeScore'] else g['away'] if g['awayScore']>g['homeScore'] else g['home']) for g in games if g['status']=='final'}
        projected = {g['id']: ('TIE' if g['awayScore']==g['homeScore'] else g['away'] if g['awayScore']>g['homeScore'] else g['home']) for g in games if g['status']=='live'}
        rows=[]
        for p in participants:
            choices=p['choices'];correct=sum(choices.get(g)==w for g,w in results.items())
            rows.append({'id':p['id'],'name':p['name'],'correct':correct,'projected':correct+sum(choices.get(g)==w for g,w in projected.items()),'complete':len(choices)==len(games)})
        eligible=[p for p in rows if p['complete']]
        for p in rows:
            p['rank']=1+sum(v['correct']>p['correct'] for v in eligible) if p['complete'] and results else None
            p['projectedRank']=1+sum(v['projected']>p['projected'] for v in eligible) if p['complete'] and (results or projected) else None
        settled=all(g['status']=='final' for g in games) and bool(eligible)
        observed=stamp();event={'id':f"{data['roundId']}-{observed}",'stateKey':key,'observedAt':observed,'source':'ESPN','phase':phase,'season':data['season'],
              'week':data['week'] if phase=='REG' else data['week']+100,'finished':len(results),'total':len(games),'live':len(projected),'settled':settled,
              'unresolved':False,'pot':len(eligible)*data['fee'],'rows':rows,'leaders':[p['id'] for p in rows if p['rank']==1],
              'projectedLeaders':[p['id'] for p in rows if p['projectedRank']==1],
              'winners':[p['id'] for p in rows if p['rank']==1] if settled else [],'games':games}
        ingest_history(conn, {'schema':1,'events':[event]})

    @app.get('/api/state')
    def get_state():
        with db() as conn:
            sandbox = g.user['role'] == 'test'
            data = state(conn, request.args.get('round'), sandbox)
            if sandbox:
                choices = {r['game_id']: r['choice'] for r in conn.execute('''SELECT p.game_id,p.choice FROM sandbox_picks p
                    JOIN games g ON g.id=p.game_id WHERE p.user_id=? AND g.round_id=?''', (g.user['id'], data['roundId']))}
                data.update(testMode=True, fee=0, participants=[{'id':g.user['id'],'name':g.user['name'],
                    'aliases':[],'paid':None,'choices':choices}])
            rounds = [dict(r) for r in conn.execute("SELECT r.*, (SELECT min(start) FROM games g WHERE g.round_id=r.id) firstGame FROM rounds r WHERE phase IN ('REG','POST') ORDER BY season,CASE phase WHEN 'REG' THEN 0 ELSE 1 END,week")]
            unread = conn.execute("SELECT count(*) FROM feedback WHERE status='new'").fetchone()[0] if g.user['role']=='admin' else 0
            history = {'schema':1,'author':AUTHOR,'events':[json.loads(r[0]) for r in conn.execute('SELECT payload FROM observations WHERE season=? AND week=? ORDER BY observed_at DESC LIMIT 10', (data['season'],data['week'] if data['phase']=='REG' else data['week']+100))][::-1]}
            if sandbox:
                history['events'] = []
            return jsonify(data=data, rounds=rounds, league=cache_get(conn,'league'), history=history,
                           user=user_json(g.user), csrf=g.session['csrf'], unread=unread, serverTime=stamp())

    @app.put('/api/picks')
    def save_picks():
        payload=body();choices=payload.get('choices');rid=payload.get('round')
        if not isinstance(choices,dict) or len(choices)>32 or not choices:
            abort(400,'Selecciona al menos una opción para guardar.')
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            selected_round(conn,rid)
            deadline = capture_deadline(conn, rid)
            now = app.config['NOW']()
            sandbox = g.user['role'] == 'test'
            picks_table = 'sandbox_picks' if sandbox else 'picks'
            changes=[]
            for gid,choice in choices.items():
                game=conn.execute('SELECT * FROM games WHERE id=? AND round_id=?',(gid,rid)).fetchone()
                if not game or choice not in (game['away'],game['home'],'TIE'):
                    abort(400,'Elección o partido inválido.')
                old=conn.execute(f'SELECT choice FROM {picks_table} WHERE user_id=? AND game_id=?',(g.user['id'],gid)).fetchone()
                if old and old[0]==choice:
                    continue
                closes_at = game_closes_at(game['start'], deadline, sandbox)
                if not sandbox and (not epoch(deadline) or now >= epoch(deadline)):
                    abort(409,'Esta jornada cerró sus elecciones. Actualiza la jornada.')
                if json.loads(game['payload']).get('timeTbd') or game['status']!='scheduled' or not closes_at or now>=epoch(closes_at):
                    abort(409,'Ese partido ya cerró sus elecciones. Actualiza la jornada.')
                conn.execute(f'INSERT INTO {picks_table} VALUES(?,?,?,?) ON CONFLICT(user_id,game_id) DO UPDATE SET choice=excluded.choice,updated_at=excluded.updated_at',
                             (g.user['id'],gid,choice,stamp()));changes.append({'game':gid,'before':old[0] if old else None,'after':choice})
            audit(conn,g.user['id'],'sandbox_picks_saved' if sandbox else 'picks_saved',{'round':rid,'changes':changes})
            if not sandbox:
                conn.execute('INSERT OR IGNORE INTO participations VALUES(?,?,NULL)',(rid,g.user['id']))
                record_state(conn,state(conn,rid))
        return jsonify(ok=True,changed=len(changes),savedAt=stamp())

    @app.route('/api/feedback',methods=['GET','POST'])
    def feedback():
        with db() as conn:
            if request.method=='POST':
                data=body();title=str(data.get('title','')).strip();text=str(data.get('body','')).strip()
                if not 3<=len(title)<=100 or not 5<=len(text)<=3000:
                    abort(400,'Escribe un título de 3 a 100 caracteres y un comentario de 5 a 3000.')
                recent=conn.execute("SELECT count(*) FROM feedback WHERE user_id=? AND created_at>?",(g.user['id'],datetime.fromtimestamp(app.config['NOW']()-3600,timezone.utc).isoformat())).fetchone()[0]
                if recent>=10:abort(429,'Ya recibimos tus comentarios. Puedes enviar más en una hora.')
                cursor=conn.execute('INSERT INTO feedback(user_id,title,body,created_at) VALUES(?,?,?,?)',(g.user['id'],title,text,stamp()))
                audit(conn,g.user['id'],'feedback_sent',{'id':cursor.lastrowid})
                return jsonify(ok=True,id=cursor.lastrowid),201
            return jsonify(items=[dict(r) for r in conn.execute('SELECT * FROM feedback WHERE user_id=? ORDER BY id DESC',(g.user['id'],))])

    @app.get('/api/admin')
    @admin
    def admin_home():
        with db() as conn:
            users=[{'id':r['id'],'name':r['name'],'username':r['username'],'role':r['role'],'mustChange':bool(r['must_change'])} for r in conn.execute("SELECT * FROM users WHERE active=1 AND role!='test' ORDER BY name")]
            items=[dict(r) for r in conn.execute('SELECT f.*,u.name FROM feedback f JOIN users u ON u.id=f.user_id ORDER BY f.id DESC')]
            latest=cache_get(conn,'monitor_status',{})
            return jsonify(users=users,feedback=items,monitor=latest)

    @app.patch('/api/admin/feedback/<int:fid>')
    @admin
    def reply(fid):
        data=body();status=data.get('status','read');reply_text=str(data.get('reply','')).strip()
        if status not in ('read','resolved') or len(reply_text)>3000:abort(400,'Respuesta inválida.')
        with db() as conn:
            if not conn.execute('SELECT id FROM feedback WHERE id=?',(fid,)).fetchone():abort(404)
            conn.execute('UPDATE feedback SET status=?,reply=?,read_at=? WHERE id=?',(status,reply_text,stamp(),fid))
            audit(conn,g.user['id'],'feedback_replied',{'id':fid,'status':status})
        return jsonify(ok=True)

    @app.patch('/api/admin/payment')
    @admin
    def payment():
        data=body();paid=data.get('paid')
        if paid is not None and type(paid) is not bool:abort(400,'Estado de aportación inválido.')
        with db() as conn:
            selected_round(conn,data.get('round'))
            if not conn.execute('SELECT id FROM users WHERE id=?',(data.get('user'),)).fetchone():abort(404)
            conn.execute('INSERT INTO participations VALUES(?,?,?) ON CONFLICT(round_id,user_id) DO UPDATE SET paid=excluded.paid',
                         (data['round'],data['user'],paid))
            audit(conn,g.user['id'],'payment_updated',data)
        return jsonify(ok=True)

    @app.post('/api/admin/reset-password')
    @admin
    def reset():
        data=body();uid=data.get('user')
        if uid==g.user['id']:abort(400,'Cambia tu contraseña desde Mi cuenta.')
        temporary=secrets.token_urlsafe(12);hashed=bcrypt.hashpw(temporary.encode(),bcrypt.gensalt(rounds=12)).decode()
        with db() as conn:
            user=conn.execute('SELECT id,username FROM users WHERE id=?',(uid,)).fetchone()
            if not user:abort(404)
            conn.execute('UPDATE users SET password_hash=?,must_change=1 WHERE id=?',(hashed,uid))
            conn.execute('DELETE FROM sessions WHERE user_id=?',(uid,));audit(conn,g.user['id'],'password_reset',{'user':uid})
        return jsonify(username=user['username'],temporaryPassword=temporary)

    def backup_response():
        temp=directory/f'backup-{secrets.token_hex(8)}.sqlite3'
        source=sqlite3.connect(app.config['DB']);target=sqlite3.connect(temp)
        try:source.backup(target)
        finally:source.close();target.close()
        raw=temp.read_bytes();temp.unlink()
        output=io.BytesIO()
        with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('quiniela.sqlite3',raw)
            z.writestr('respaldo.json',json.dumps({'author':AUTHOR,'createdAt':stamp(),'format':'SQLite','includes':'Cuentas, elecciones, aportaciones, comentarios e historial'},ensure_ascii=False))
        output.seek(0)
        return send_file(output,mimetype='application/zip',as_attachment=True,download_name=f'quiniela-{utcnow():%Y%m%dT%H%M%SZ}.zip')

    @app.get('/api/admin/backup')
    @admin
    def backup():return backup_response()

    @app.get('/internal/backup')
    def machine_backup():
        require_backup_token()
        return backup_response()

    def require_backup_token():
        expected=os.environ.get('BACKUP_TOKEN_SHA256','')
        supplied=request.headers.get('Authorization','').removeprefix('Bearer ')
        if not expected or not hmac.compare_digest(digest(supplied),expected):abort(401)

    @app.get('/internal/history')
    def machine_history():
        require_backup_token()
        with db() as conn:
            events=[json.loads(r[0]) for r in conn.execute('SELECT payload FROM observations ORDER BY observed_at')]
        return jsonify(schema=1,author=AUTHOR,updatedAt=events[-1]['observedAt'] if events else stamp(),events=events)

    @app.get('/internal/league')
    def machine_league():
        require_backup_token()
        with db() as conn:return jsonify(cache_get(conn,'league'))

    @app.get('/api/admin/export-history')
    @admin
    def export_history():
        with db() as conn:
            events=[json.loads(r[0]) for r in conn.execute('SELECT payload FROM observations ORDER BY observed_at')]
        return jsonify(schema=1,author=AUTHOR,updatedAt=events[-1]['observedAt'] if events else stamp(),events=events)

    @app.get('/health')
    def health():
        with db() as conn:
            conn.execute('SELECT count(*) FROM rounds').fetchone()
            monitor=cache_get(conn,'monitor_status',{})
            league=cache_get(conn,'league',{})
        return jsonify(ok=True,application='la-quiniela-fiscalizada',monitor={k:monitor.get(k) for k in ['checkedAt','lastSourceCheck','active','error']},calendarUpdatedAt=league.get('calendarUpdatedAt'))

    @app.get('/')
    @app.get('/login')
    def index():
        return send_from_directory(ROOT/'portal','index.html')

    @app.get('/assets/<path:filename>')
    def assets(filename):return send_from_directory(ROOT/'assets',filename)

    @app.get('/portal/<path:filename>')
    def portal_assets(filename):
        if filename not in ('ui.mjs','portal.css'):abort(404)
        return send_from_directory(ROOT/'portal',filename)

    @app.get('/<filename>')
    def shared(filename):
        if filename not in ('theme.css','core.mjs','race.mjs','league.mjs','icons.mjs'):abort(404)
        return send_from_directory(ROOT,filename)

    def sync_once():
        from portal.collector import collect
        with app.app_context():
            return collect(db,cache_get,cache_set,import_games,state,record_state)

    app.qf={'db':db,'state':state,'record':record_state,'sync':sync_once,'import_games':import_games,'cache_get':cache_get,'cache_set':cache_set}
    return app


def apply_score(conn, update):
    row=conn.execute('SELECT status,payload FROM games WHERE id=?',(update['id'],)).fetchone()
    if not row or row['status']=='final' and update['status']!='final':return
    payload=json.loads(row['payload']);payload.update(update)
    conn.execute('UPDATE games SET status=?,away_score=?,home_score=?,payload=?,checked_at=? WHERE id=?',
                 (update['status'],update.get('awayScore'),update.get('homeScore'),json.dumps(payload),update.get('checkedAt',stamp()),update['id']))


def ingest_history(conn, history):
    for event in history.get('events',[]):
        conn.execute('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?,?,?,?,?)',
                     (event['id'],event['season'],event['week'],event['observedAt'],stamp(),event['live'],int(event['settled']),event['pot'],json.dumps(event,ensure_ascii=False)))
        for row in event['rows']:
            conn.execute('INSERT OR IGNORE INTO participant_scores VALUES(?,?,?,?,?,?,?)',
                         (event['id'],row['id'],row['name'],row['correct'],row['projected'],row['rank'],row['projectedRank']))
    for season,week in conn.execute('SELECT DISTINCT season,week FROM observations').fetchall():
        event=json.loads(conn.execute('SELECT payload FROM observations WHERE season=? AND week=? ORDER BY observed_at DESC LIMIT 1',(season,week)).fetchone()[0])
        if event['settled']:
            for row in event['rows']:
                if row['id'] in event['winners']:
                    conn.execute('INSERT INTO round_winners VALUES(?,?,?,?,?,?,?) ON CONFLICT(season,week,participant_id) DO UPDATE SET observation_id=excluded.observation_id,correct=excluded.correct,pot=excluded.pot',
                                 (season,week,event['id'],row['id'],row['name'],row['correct'],event['pot']))


app=create_app()
if os.environ.get('RUN_COLLECTOR')=='1':
    def watch():
        while True:
            try:
                result=app.qf['sync']()
                delay=30 if result.get('active') else 300
            except Exception as exc:
                app.logger.error('Seguimiento no disponible: %s',type(exc).__name__)
                with app.qf['db']() as conn:
                    status=app.qf['cache_get'](conn,'monitor_status',{})
                    status.update(error=type(exc).__name__,lastErrorAt=stamp())
                    app.qf['cache_set'](conn,'monitor_status',status)
                delay=60
            time.sleep(delay)
    threading.Thread(target=watch,name='seguimiento-nfl',daemon=True).start()
