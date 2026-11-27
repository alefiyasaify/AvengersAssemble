# ExpenseFlow backend: FastAPI + SQLite. Applies migrations on start, then serves on :8000.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first (cached layer). requirements.txt is generated from uv.lock.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini ./
COPY app ./app

ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA} \
    DATABASE_URL=sqlite:////app/data/app.db \
    RECEIPTS_DIR=/app/data/receipts

# Non-root user; /app/data is the volume for the SQLite file and receipts.
RUN useradd --create-home --uid 10001 app \
    && mkdir -p /app/data/receipts \
    && chown -R app:app /app
USER app

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz').status == 200 else 1)"

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn --factory app.main:create_app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
