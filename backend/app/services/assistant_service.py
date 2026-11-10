"""The help chat: a small question-answering engine that runs entirely inside the application (no outside AI service).

It answers from app/knowledge/manual.md. Every "## " section is one topic; the question is matched to the topics with
BM25 ranking over the title, the keywords and the text, and the best topic is given back as the answer with a link to the
page to open. The file is re-read whenever it changes, so keeping the manual up to date IS keeping the chat up to date."""
import math
import os
import re
from typing import Any, Dict, List, Optional

KB_PATH = os.path.join(os.path.dirname(__file__), "..", "knowledge", "manual.md")
SUPPORT = "contact@pysellers.in, 8838587824"

STOP = set("""a an the is are was were be been am do does did how what when where why which who whom can could should would will shall may might
i me my we our you your it its this that these those to of in on at for from by with and or but not no yes please tell show about into
than then there here as if so any all some get got make made want need like use using used""".split())

GREETINGS = {"hi", "hello", "hey", "hai", "vanakkam", "good morning", "good afternoon", "good evening", "thanks", "thank you", "ok", "okay"}

_cache: Dict[str, Any] = {"mtime": None, "topics": [], "df": {}, "avg": 1.0}


def _stem(word: str) -> str:
    for suffix in ("ing", "ed", "es", "s"):
        if len(word) > len(suffix) + 2 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def _tokens(text: str) -> List[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return [_stem(w) for w in words if w not in STOP and len(w) > 1]


def _load() -> None:
    mtime = os.path.getmtime(KB_PATH)
    if _cache["mtime"] == mtime:
        return
    topics: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    with open(KB_PATH, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if line.startswith("## "):
                current = {"title": line[3:].strip(), "keywords": "", "link": "", "body": []}
                topics.append(current)
            elif current is not None:
                if line.startswith("Keywords:"):
                    current["keywords"] = line[len("Keywords:"):].strip()
                elif line.startswith("Link:"):
                    current["link"] = line[len("Link:"):].strip()
                elif line.strip():
                    current["body"].append(line.strip())
    df: Dict[str, int] = {}
    total = 0
    for t in topics:
        t["text"] = " ".join(t["body"])
        # the title counts three times and the keywords twice: they say what the topic is about
        t["tokens"] = _tokens(t["title"]) * 3 + _tokens(t["keywords"]) * 2 + _tokens(t["text"])
        total += len(t["tokens"])
        for w in set(t["tokens"]):
            df[w] = df.get(w, 0) + 1
    _cache.update({"mtime": mtime, "topics": topics, "df": df, "avg": (total / len(topics)) if topics else 1.0})


def topics() -> List[Dict[str, str]]:
    _load()
    return [{"title": t["title"], "link": t["link"]} for t in _cache["topics"]]


def _score(query: List[str], topic: Dict[str, Any]) -> float:
    n = len(_cache["topics"])
    tokens = topic["tokens"]
    length = len(tokens) or 1
    counts: Dict[str, int] = {}
    for w in tokens:
        counts[w] = counts.get(w, 0) + 1
    k1, b = 1.4, 0.7
    score = 0.0
    for w in query:
        f = counts.get(w, 0)
        if not f:
            continue
        df = _cache["df"].get(w, 0)
        idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
        score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * length / _cache["avg"]))
    # a phrase from the question inside the title is a strong hint
    title = topic["title"].lower()
    if any(w in title for w in query):
        score *= 1.25
    return score


def _answer_text(topic: Dict[str, Any], limit: int = 900) -> str:
    text = topic["text"]
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind("; "))
    return (cut[: end + 1] if end > 300 else cut.rstrip()) + " ..."


def ask(question: str) -> Dict[str, Any]:
    _load()
    q = (question or "").strip()
    if not q:
        return {"answer": "Type your question, for example: How do I add an advance payment?", "link": "", "sources": [], "found": False}
    if q.lower().strip("!. ") in GREETINGS:
        return {"answer": "Hello! Ask me anything about using the billing software - orders, job cards, payments, stock, reports. For example: \"How do I assign a task to an employee?\"",
                "link": "", "sources": [], "found": True}
    query = _tokens(q)
    ranked = sorted(((_score(query, t), t) for t in _cache["topics"]), key=lambda p: -p[0])
    ranked = [(s, t) for s, t in ranked if s > 0]
    if not ranked or ranked[0][0] < 1.2:
        suggestions = [{"title": t["title"], "link": t["link"]} for _, t in ranked[:3]]
        return {
            "answer": f"I could not find that in the manual. Please try other words, or contact support: {SUPPORT}.",
            "link": "", "sources": suggestions, "found": False,
        }
    best = ranked[0][1]
    related = [{"title": t["title"], "link": t["link"]} for s, t in ranked[1:4] if s >= ranked[0][0] * 0.45]
    return {
        "answer": f"{best['title']}\n{_answer_text(best)}",
        "link": best["link"], "sources": related, "found": True,
    }
