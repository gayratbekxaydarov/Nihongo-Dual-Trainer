"""Aytilgan so'zni tekshirish.

Brauzer ovozni matnga aylantiradi (ko'pincha kanji bilan yozadi). Bu yerda matn
talaffuzga (hiragana) aylantirilib, kutilgan o'qilish bilan solishtiriladi.
Shu tufayli bir xil o'qiladigan kanjilar (masalan 下りる / 降りる, ikkalasi ham
"おりる") ham to'g'ri hisoblanadi.

Solishtirish ataylab QATTIQ: "さがる" va "さげる" kabi bir harfga farq qiluvchi
juft so'zlar (o'timli/o'timsiz fe'llar) aralashib ketmasligi kerak, shuning uchun
noaniq (fuzzy) moslashtirish ishlatilmaydi.
"""
from __future__ import annotations

import re
import unicodedata

import pykakasi

_kks = pykakasi.kakasi()

_PUNCT = re.compile(r"[\s\u3000、。，．,.!?！？「」『』（）()〜~・\-]")
_MAX_EXTRA = 4  # "勉強です" kabi qisqa qo'shimchalarga yo'l qo'yiladi


def _kata_to_hira(text: str) -> str:
    return "".join(
        chr(ord(c) - 0x60) if "\u30a1" <= c <= "\u30f6" else c for c in text
    )


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    return _kata_to_hira(_PUNCT.sub("", text))


def to_hiragana(text: str) -> str:
    """Matnni (kanji aralash bo'lsa ham) hiragana talaffuziga aylantiradi."""
    text = _PUNCT.sub("", unicodedata.normalize("NFKC", text))
    if not text:
        return ""
    return _kata_to_hira("".join(item["hira"] for item in _kks.convert(text)))


def variants(text: str) -> set[str]:
    """So'zning qabul qilinadigan shakllari: 真面目な -> 真面目, 質問する -> 質問."""
    base = normalize(text)
    out = {base} if base else set()
    for suffix in ("する", "な"):
        if base.endswith(suffix) and len(base) - len(suffix) >= 2:
            out.add(base[: -len(suffix)])
    return out


def _match(heard: str, targets: set[str]) -> bool:
    if not heard:
        return False
    return any(
        heard == t or (t in heard and len(heard) <= len(t) + _MAX_EXTRA)
        for t in targets
    )


def check(kanji: str, reading: str, heard_list: list[str]) -> dict:
    targets_raw = variants(kanji) | variants(reading)
    targets_reading = variants(reading)

    first_reading = ""
    for idx, heard in enumerate(heard_list):
        raw = normalize(heard)
        hira = to_hiragana(heard)
        if idx == 0:
            first_reading = hira
        if _match(raw, targets_raw) or _match(hira, targets_reading):
            return {"correct": True, "heard_reading": hira or first_reading}
    return {"correct": False, "heard_reading": first_reading}
