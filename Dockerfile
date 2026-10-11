FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN groupadd --system courtlens && useradd --system --gid courtlens --home /app courtlens

COPY pyproject.toml README.md requirements-lock.txt ./
COPY src ./src
COPY migrations ./migrations
COPY alembic.ini ./
COPY fixtures ./fixtures
COPY evaluation ./evaluation
COPY config ./config
COPY warehouse ./warehouse

RUN pip install --upgrade pip && pip install -c requirements-lock.txt ".[warehouse]"

RUN mkdir -p /app/data/raw /app/data/artifacts /app/data/cache && chown -R courtlens:courtlens /app
USER courtlens

EXPOSE 8000
CMD ["uvicorn", "courtlens.api.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
