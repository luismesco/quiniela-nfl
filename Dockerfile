FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/data RUN_COLLECTOR=1
COPY portal/requirements.txt /app/portal/requirements.txt
RUN pip install --no-cache-dir -r /app/portal/requirements.txt
COPY portal /app/portal
COPY assets /app/assets
COPY core.mjs race.mjs league.mjs icons.mjs theme.css /app/
COPY quiniela.json scores.json league.json race-history.json /app/
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 8 --timeout 120 --access-logfile - --error-logfile - portal.server:app"]
