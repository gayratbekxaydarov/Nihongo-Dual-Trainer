from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from .checker import check

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Nihongo Voice Trainer")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


def find_words_file() -> Path | None:
    candidates = [
        os.environ.get("WORDS_FILE"),
        BASE_DIR.parent / "words.json",         # Docker: /app/words.json
        BASE_DIR.parent.parent / "words.json",  # lokal ishga tushirish: repo ildizi
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    return None


@app.get("/")
def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/words")
def get_words():
    path = find_words_file()
    if path is None:
        raise HTTPException(status_code=404, detail="words.json topilmadi")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"words.json o'qilmadi: {exc}")

    words = [
        w for w in data
        if isinstance(w, dict) and w.get("kanji") and w.get("reading")
    ]
    if not words:
        raise HTTPException(status_code=404, detail="words.json bo'sh yoki formati noto'g'ri")
    return words


class CheckIn(BaseModel):
    kanji: str = Field(max_length=40)
    reading: str = Field(max_length=40)
    heard: list[str] = Field(min_length=1, max_length=5)


@app.post("/api/check")
def check_answer(body: CheckIn):
    """Aytilgan matnni talaffuz (hiragana) bo'yicha tekshiradi."""
    heard = [h[:100] for h in body.heard]
    return check(body.kanji, body.reading, heard)
