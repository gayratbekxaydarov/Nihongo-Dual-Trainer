# Build context: repo ildizi (docker-compose.yml va render.yaml shunday sozlangan)
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY 1-voice-trainer/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY 1-voice-trainer/app ./app
COPY words.json ./words.json

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
