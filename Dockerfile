FROM node:22-alpine AS frontend

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt

COPY app.py ./
COPY templates ./templates
COPY static ./static
COPY --from=frontend /app/static/dist ./static/dist
COPY creditguard_model.pkl combined_credit_risk_realistic_with_ids.csv ./

RUN addgroup --system --gid 10001 creditguard \
    && adduser --system --uid 10001 --ingroup creditguard --no-create-home creditguard \
    && chown -R creditguard:creditguard /app

USER creditguard

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8080') + '/api/v1/health', timeout=4)"

CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 4 --timeout 120 --access-logfile - --error-logfile -"]
