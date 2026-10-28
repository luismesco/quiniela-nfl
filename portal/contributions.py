"""Control de aportaciones. Autor: Luis Montañez Escobar."""
import io
import json
from datetime import datetime, timezone

from flask import abort, g, jsonify, request, send_file


def register_contributions(app, db, selected_round, cache_get, audit):
    with db() as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS contribution_records(
          round_id TEXT REFERENCES rounds(id),user_id TEXT REFERENCES users(id),
          received_at TEXT,updated_at TEXT NOT NULL,updated_by TEXT REFERENCES users(id),
          revision INTEGER NOT NULL,PRIMARY KEY(round_id,user_id))''')

    def access(conn, rid):
        target = selected_round(conn, rid)
        row = conn.execute('SELECT payload FROM treasurer_draws WHERE round_id=?', (rid,)).fetchone()
        chosen = json.loads(row['payload']).get('winner') if row else None
        if getattr(g, 'admin_sandbox', False):
            if not g.user or g.user['role'] != 'admin':
                abort(403, 'Sólo Luis puede probar el control de aportaciones.')
            return {'canView': True, 'canManage': target['phase'] in ('REG', 'POST'), 'canDownload': True,
                    'treasurer': {'id': chosen['id'], 'name': chosen['name']} if chosen else None,
                    'reason': None, 'sandbox': True}
        real = bool(g.user and g.user['role'] != 'test')
        permitted = real and (g.user['role'] == 'admin' or chosen and chosen.get('id') == g.user['id'])
        current = target['id'] == selected_round(conn)['id']
        enabled = cache_get(conn, 'round_deadline:' + target['id']) is not None
        writable = bool(permitted and chosen and current and enabled and target['phase'] in ('REG', 'POST'))
        reason = None if writable else ('El control de esta jornada es de consulta.' if not current else
                  'El registro estará disponible cuando se habilite la jornada y se asigne al tesorero.')
        return {'canView': bool(permitted), 'canManage': writable, 'canDownload': bool(permitted),
                'treasurer': {'id': chosen['id'], 'name': chosen['name']} if chosen else None, 'reason': reason}

    def require_access(conn, rid, write=False):
        result = access(conn, rid)
        if not result['canView']:
            abort(403, 'El control de aportaciones corresponde al tesorero de esta jornada y a Luis.')
        if write and not result['canManage']:
            abort(409, result['reason'])
        return result

    def read(conn, rid):
        permissions = require_access(conn, rid)
        sandbox = getattr(g, 'admin_sandbox', False)
        target = selected_round(conn, rid)
        total = conn.execute('SELECT count(*) FROM games WHERE round_id=?', (rid,)).fetchone()[0]
        rows = conn.execute('''SELECT u.id,u.name,p.paid paid,c.received_at,c.updated_at,c.revision,
          actor.name updated_by,(SELECT count(*) FROM picks x JOIN games g ON g.id=x.game_id
          WHERE x.user_id=u.id AND g.round_id=?) choices
          FROM users u LEFT JOIN participations p ON p.user_id=u.id AND p.round_id=?
          LEFT JOIN contribution_records c ON c.user_id=u.id AND c.round_id=?
          LEFT JOIN users actor ON actor.id=c.updated_by
          WHERE u.active=1 AND u.role!='test' ORDER BY u.name COLLATE NOCASE,u.id''', (rid, rid, rid)).fetchall()
        participants = [{'id': r['id'], 'name': r['name'], 'paid': None if r['paid'] is None else bool(r['paid']),
                         'choices': r['choices'], 'complete': bool(total and r['choices'] == total),
                         'receivedAt': r['received_at'], 'updatedAt': r['updated_at'],
                         'updatedBy': r['updated_by'], 'revision': r['revision'] or 0} for r in rows]
        received = sum(p['paid'] is True for p in participants)
        pending = sum(p['complete'] and p['paid'] is not True for p in participants)
        return {**permissions, 'roundId': rid, 'season': target['season'], 'week': target['week'],
                'phase': target['phase'], 'fee': target['fee'], 'currency': 'MXN', 'totalGames': total,
                'participants': participants, 'receivedCount': received, 'receivedAmount': received * target['fee'],
                'completeCount': sum(p['complete'] for p in participants), 'pendingCompleteCount': pending,
                'updatedAt': datetime.now(timezone.utc).isoformat(), 'sandbox': sandbox}

    def update(conn, rid, uid, paid, actor, revision=None):
        sandbox = getattr(g, 'admin_sandbox', False)
        selected_round(conn, rid)
        if paid is not None and type(paid) is not bool:
            abort(400, 'Estado de aportación inválido.')
        if not isinstance(uid, str) or not conn.execute(
                "SELECT id FROM users WHERE id=? AND active=1 AND role!='test'", (uid,)).fetchone():
            abort(404, 'No existe ese integrante en el grupo.')
        old = conn.execute('SELECT paid FROM participations WHERE round_id=? AND user_id=?', (rid, uid)).fetchone()
        previous = None if old is None or old['paid'] is None else bool(old['paid'])
        record = conn.execute('SELECT revision FROM contribution_records WHERE round_id=? AND user_id=?', (rid, uid)).fetchone()
        current_revision = record['revision'] if record else 0
        # Repetir una confirmación ya guardada no crea otra recepción ni otra fecha.
        if previous is paid:
            return False
        if revision is not None and revision != current_revision:
            abort(409, 'Esta aportación cambió en otra sesión. Actualiza el control antes de corregirla.')
        at = datetime.now(timezone.utc).isoformat()
        received_at = at if paid else None
        conn.execute('''INSERT INTO participations VALUES(?,?,?) ON CONFLICT(round_id,user_id)
          DO UPDATE SET paid=excluded.paid''', (rid, uid, paid))
        conn.execute('''INSERT INTO contribution_records VALUES(?,?,?,?,?,?) ON CONFLICT(round_id,user_id)
          DO UPDATE SET received_at=excluded.received_at,updated_at=excluded.updated_at,
          updated_by=excluded.updated_by,revision=excluded.revision''',
          (rid, uid, received_at, at, actor, current_revision + 1))
        audit(conn, actor, 'sandbox_payment_updated' if sandbox else 'payment_updated', {'round': rid, 'user': uid, 'paid': paid, 'previous': previous,
              'revision': current_revision + 1, 'receivedAt': received_at})
        return True

    @app.get('/api/treasurer/contributions')
    def contributions():
        with db() as conn:
            conn.execute('BEGIN')
            rid = selected_round(conn, request.args.get('round'))['id']
            return jsonify(read(conn, rid))

    @app.patch('/api/treasurer/contributions')
    def contribution_update():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or not isinstance(payload.get('round'), str):
            abort(400, 'Indica la jornada de la aportación.')
        if 'paid' not in payload or type(payload.get('revision')) is not int or payload['revision'] < 0:
            abort(400, 'Indica el estado y la revisión de la aportación.')
        if 'sandbox' in payload:
            abort(400, 'Activa el modo de prueba general desde Probar funciones.')
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            rid = selected_round(conn, payload['round'])['id']
            require_access(conn, rid, write=True)
            changed = update(conn, rid, payload.get('user'), payload['paid'], g.user['id'], payload['revision'])
            return jsonify(ok=True, changed=changed, contributions=read(conn, rid))

    @app.get('/api/treasurer/contributions.xlsx')
    def contribution_export():
        from portal.contribution_xlsx import export_workbook
        with db() as conn:
            conn.execute('BEGIN')
            rid = selected_round(conn, request.args.get('round'))['id']
            data = read(conn, rid)
        return send_file(io.BytesIO(export_workbook(data)), as_attachment=True,
                         mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                         download_name=f'aportaciones-{"PRUEBA-" if data["sandbox"] else ""}{rid}.xlsx')

    return access, update
