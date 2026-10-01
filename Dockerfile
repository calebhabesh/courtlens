FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN groupadd --system courtload && useradd --system --gid courtload --home /app courtload

COPY pyproject.toml README.md ./
COPY src ./src
COPY migrations ./migrations
COPY alembic.ini ./
COPY fixtures ./fixtures
COPY evaluation ./evaluation
COPY warehouse ./warehouse

RUN pip install --upgrade pip && pip install ".[warehouse]"

RUN mkdir -p /app/data/raw /app/data/artifacts /app/data/cache && chown -R courtload:courtload /app
USER courtload

EXPOSE 8000
CMD ["uvicorn", "courtload.api.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
