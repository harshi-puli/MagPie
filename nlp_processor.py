"""
MagPie — Free NLP Processor
Full local NLP pipeline — zero API cost.

Features:
  - TextRank summarization
  - TF-IDF keyword extraction
  - Term co-occurrence graph
  - spaCy Named Entity Recognition
  - Readability + article stats (Flesch-Kincaid)
  - Sentiment arc (VADER-style lexicon)
  - Key question extraction
  - Relevant outbound link scoring

Install:
  pip install spacy
  python -m spacy download en_core_web_sm
"""

import re
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse


# ── spaCy loader ──────────────────────────────────────────────────────────────

def _load_spacy():
    try:
        import spacy
        try:
            return spacy.load("en_core_web_sm")
        except OSError:
            raise RuntimeError("Run: python -m spacy download en_core_web_sm")
    except ImportError:
        raise RuntimeError("Run: pip install spacy")


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class NLPResult:
    title: str
    summary: str
    tags: list[str]
    links: list[str]               # wikilink concept names
    content: str                   # cleaned content with [[wikilinks]]
    key_terms: list[str]           # TF-IDF top terms
    main_ideas: list[str]          # top TextRank sentences
    entities: list[str]            # spaCy named entities
    related_links: list[dict]      # top 3 scored outbound links
    co_occurrences: list[dict]     # [{term_a, term_b, strength}]
    stats: dict                    # readability + article metrics
    sentiment_arc: list[dict]      # [{section, label, score}]
    questions: list[str]           # extracted key questions
    success: bool
    error: Optional[str] = None


# ── Stopwords ─────────────────────────────────────────────────────────────────

STOPWORDS = {
    "the","a","an","and","or","but","in","on","at","to","for","of","with",
    "is","are","was","were","be","been","being","have","has","had","do",
    "does","did","will","would","could","should","may","might","this","that",
    "these","those","it","its","by","from","as","so","if","not","no","can",
    "our","we","i","you","he","she","they","their","your","my","his","her",
    "also","more","one","two","three","first","second","new","use","used",
    "using","make","made","making","get","got","getting","said","says","say",
    "just","like","than","then","when","where","what","how","who","which",
    "there","here","about","into","through","during","before","after",
    "above","below","between","each","all","both","few","some","such",
    "only","own","same","too","very","s","t","ll","m","re","ve","d",
    "didn","doesn","hadn","don","now","click","read","more","page","site",
    "website","www","http","https","com","org","net","article","section",
}

QUESTION_WORDS = {"what","why","how","when","where","who","which","whose","whom"}


# ══════════════════════════════════════════════════════════════════════════════
# 1. TEXTRANK SUMMARIZATION
# ══════════════════════════════════════════════════════════════════════════════

def _sentence_similarity(s1: set, s2: set) -> float:
    if not s1 or not s2:
        return 0.0
    return len(s1 & s2) / (math.log(len(s1) + 1) + math.log(len(s2) + 1))


def textrank_summarize(text: str, n_sentences: int = 3) -> tuple[str, list[str]]:
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    sentences = [s.strip() for s in sentences if len(s.split()) > 6]
    if len(sentences) <= n_sentences:
        top = sentences[:n_sentences]
        return " ".join(top), top

    word_sets = [
        set(w.lower() for w in re.findall(r'\b\w+\b', s) if w.lower() not in STOPWORDS)
        for s in sentences
    ]
    scores = [
        sum(_sentence_similarity(word_sets[i], word_sets[j]) for j in range(len(sentences)) if i != j)
        for i in range(len(sentences))
    ]
    top_indices = sorted(sorted(range(len(sentences)), key=lambda i: scores[i], reverse=True)[:n_sentences])
    top = [sentences[i] for i in top_indices]
    return " ".join(top), [s[:80] + ("…" if len(s) > 80 else "") for s in top]


# ══════════════════════════════════════════════════════════════════════════════
# 2. TF-IDF KEYWORDS
# ══════════════════════════════════════════════════════════════════════════════

def tfidf_keywords(text: str, top_n: int = 10) -> list[str]:
    words = re.findall(r'\b[a-zA-Z][a-zA-Z\-]{2,}\b', text.lower())
    words = [w for w in words if w not in STOPWORDS]
    total = len(words)
    if total == 0:
        return []
    freq = Counter(words)
    scores = {w: (c / total) * math.log(total / c) for w, c in freq.items()}
    top = sorted(scores, key=scores.get, reverse=True)[:top_n]
    return [w.replace("-", " ") for w in top]


# ══════════════════════════════════════════════════════════════════════════════
# 3. CO-OCCURRENCE GRAPH
# ══════════════════════════════════════════════════════════════════════════════

def build_cooccurrence(text: str, key_terms: list[str], window: int = 50) -> list[dict]:
    """
    For each pair of key terms, count how many times they appear
    within `window` words of each other across the whole text.
    Returns edges sorted by strength, capped at top 12.

    This is the same intuition behind word2vec — terms that appear
    in similar contexts are semantically related.
    """
    if len(key_terms) < 2:
        return []

    words = re.findall(r'\b\w+\b', text.lower())
    term_set = {t.lower().replace(" ", "_"): t for t in key_terms}

    # Normalize text words to match multi-word terms
    normalized = []
    i = 0
    while i < len(words):
        matched = False
        # Try 2-word phrases first
        if i < len(words) - 1:
            bigram = words[i] + "_" + words[i+1]
            if bigram in term_set:
                normalized.append(bigram)
                i += 2
                matched = True
        if not matched:
            mono = words[i]
            normalized.append(mono if mono in term_set else "__")
            i += 1

    # Sliding window co-occurrence count
    pair_counts: Counter = Counter()
    term_positions = {t: [] for t in term_set}
    for idx, w in enumerate(normalized):
        if w in term_set:
            term_positions[w].append(idx)

    terms_list = list(term_set.keys())
    for i_t, t1 in enumerate(terms_list):
        for t2 in terms_list[i_t+1:]:
            count = 0
            for pos1 in term_positions[t1]:
                for pos2 in term_positions[t2]:
                    if abs(pos1 - pos2) <= window:
                        count += 1
            if count > 0:
                pair_counts[(t1, t2)] = count

    if not pair_counts:
        return []

    max_count = max(pair_counts.values())
    edges = []
    for (t1, t2), count in pair_counts.most_common(12):
        strength = round(count / max_count, 2)  # normalize 0-1
        if strength >= 0.1:  # filter very weak links
            edges.append({
                "term_a": term_set[t1],
                "term_b": term_set[t2],
                "strength": strength,
                "count": count,
            })

    return edges


# ══════════════════════════════════════════════════════════════════════════════
# 4. ARTICLE STATS + READABILITY (Flesch-Kincaid)
# ══════════════════════════════════════════════════════════════════════════════

def _count_syllables(word: str) -> int:
    """Rough syllable count — good enough for readability scoring."""
    word = word.lower().rstrip("esed")
    vowels = re.findall(r'[aeiou]+', word)
    return max(1, len(vowels))


def compute_stats(text: str) -> dict:
    """
    Returns:
      - word_count, sentence_count, avg_sentence_length
      - vocabulary_richness (type-token ratio)
      - flesch_kincaid_grade
      - reading_level (label)
      - estimated_read_minutes
    """
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    sentences = [s for s in sentences if len(s.split()) > 2]
    words = re.findall(r'\b[a-zA-Z]+\b', text)

    if not words or not sentences:
        return {}

    word_count = len(words)
    sentence_count = len(sentences)
    avg_sentence_len = word_count / sentence_count

    # Type-token ratio (vocabulary richness) — 1.0 = every word unique
    unique_words = len(set(w.lower() for w in words))
    ttr = round(unique_words / word_count, 3)

    # Flesch-Kincaid Grade Level
    total_syllables = sum(_count_syllables(w) for w in words)
    fk_grade = 0.39 * avg_sentence_len + 11.8 * (total_syllables / word_count) - 15.59
    fk_grade = max(1, round(fk_grade, 1))

    # Human-readable level
    if fk_grade <= 6:
        level = "Elementary"
    elif fk_grade <= 9:
        level = "Middle School"
    elif fk_grade <= 12:
        level = "High School"
    elif fk_grade <= 16:
        level = "College"
    else:
        level = "Graduate"

    read_minutes = max(1, round(word_count / 200))  # avg 200 wpm

    return {
        "word_count": word_count,
        "sentence_count": sentence_count,
        "avg_sentence_length": round(avg_sentence_len, 1),
        "vocabulary_richness": ttr,
        "flesch_kincaid_grade": fk_grade,
        "reading_level": level,
        "estimated_read_minutes": read_minutes,
        "unique_words": unique_words,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 5. SENTIMENT ARC
# ══════════════════════════════════════════════════════════════════════════════

# Minimal VADER-style lexicon — positive and negative word sets
# Weighted: strong words score ±2, moderate ±1
_POS_STRONG = {
    "excellent","outstanding","revolutionary","breakthrough","amazing","incredible",
    "exceptional","brilliant","innovative","transformative","powerful","remarkable",
    "tremendous","extraordinary","phenomenal","superb","magnificent","spectacular",
}
_POS_MOD = {
    "good","great","effective","useful","helpful","successful","improved","better",
    "positive","benefit","advantage","efficient","clear","strong","promising",
    "interesting","important","significant","valuable","recommend","easy","fast",
    "smart","capable","reliable","robust","scalable","flexible","modern","clean",
}
_NEG_STRONG = {
    "terrible","awful","catastrophic","disastrous","horrible","devastating","fatal",
    "broken","fails","failed","dangerous","toxic","malicious","corrupt","fraud",
    "impossible","useless","worthless","harmful","critical","severe","alarming",
}
_NEG_MOD = {
    "bad","poor","difficult","problem","issue","challenge","limited","slow",
    "complicated","confusing","error","bug","risk","concern","warning","deprecated",
    "complex","expensive","hard","missing","lack","fail","wrong","weak","unstable",
}

def _score_text_sentiment(text: str) -> float:
    """Return sentiment score for a block of text. Positive = positive."""
    words = set(re.findall(r'\b[a-z]+\b', text.lower()))
    score = 0.0
    score += sum(2 for w in words if w in _POS_STRONG)
    score += sum(1 for w in words if w in _POS_MOD)
    score -= sum(2 for w in words if w in _NEG_STRONG)
    score -= sum(1 for w in words if w in _NEG_MOD)
    # Normalize by word count to avoid length bias
    word_count = len(re.findall(r'\b\w+\b', text))
    return round(score / max(word_count, 1) * 100, 2)


def sentiment_arc(text: str, n_sections: int = 4) -> list[dict]:
    """
    Split text into n equal sections, score each.
    Returns [{section, label, score, emoji}]
    This lets you see if an article starts negative and ends positive (building hope)
    or vice versa (raising alarm).
    """
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    sentences = [s for s in sentences if len(s.split()) > 3]

    if len(sentences) < n_sections:
        return []

    chunk_size = len(sentences) // n_sections
    sections = []
    labels = ["Opening", "Early", "Middle", "Closing"] if n_sections == 4 else [f"Part {i+1}" for i in range(n_sections)]

    for i in range(n_sections):
        start = i * chunk_size
        end = (i + 1) * chunk_size if i < n_sections - 1 else len(sentences)
        chunk = " ".join(sentences[start:end])
        score = _score_text_sentiment(chunk)

        if score > 1.5:
            label, emoji = "Positive", "😊"
        elif score > 0.3:
            label, emoji = "Slightly Positive", "🙂"
        elif score < -1.5:
            label, emoji = "Negative", "😟"
        elif score < -0.3:
            label, emoji = "Slightly Negative", "😐"
        else:
            label, emoji = "Neutral", "😶"

        sections.append({
            "section": labels[i],
            "score": score,
            "label": label,
            "emoji": emoji,
            "display": f"{labels[i]}: {emoji} {label}",
        })

    return sections


# ══════════════════════════════════════════════════════════════════════════════
# 6. KEY QUESTION EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def extract_questions(text: str, max_questions: int = 5) -> list[str]:
    """
    Extract sentences that are genuine questions.
    Filters out rhetorical nav questions like "Want to learn more?"
    """
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    questions = []
    noise = {"want to", "need to", "ready to", "looking to", "click here",
             "sign up", "subscribe", "contact us", "learn more", "find out"}

    for s in sentences:
        s = s.strip()
        if not s.endswith("?"):
            continue
        s_lower = s.lower()
        # Must start with question word or have one in first 4 words
        first_words = set(s_lower.split()[:4])
        if not (first_words & QUESTION_WORDS):
            continue
        # Skip nav/boilerplate questions
        if any(n in s_lower for n in noise):
            continue
        # Must be a real sentence (not just 2-3 words)
        if len(s.split()) < 4:
            continue
        clean = s[:100] + ("…" if len(s) > 100 else "")
        questions.append(clean)
        if len(questions) >= max_questions:
            break

    return questions


# ══════════════════════════════════════════════════════════════════════════════
# 7. OUTBOUND LINK SCORING
# ══════════════════════════════════════════════════════════════════════════════

NOISE_DOMAINS = {
    "twitter.com","x.com","facebook.com","instagram.com","linkedin.com",
    "youtube.com","reddit.com","tiktok.com","t.co","bit.ly","amzn.to",
}
NOISE_TEXT = {
    "click here","here","read more","learn more","more","source","link",
    "this","view","see","visit","website","homepage","home","back","next",
    "previous","prev","continue","subscribe","sign up",
}

def extract_outbound_links(markdown: str, source_url: str = "") -> list[dict]:
    source_domain = urlparse(source_url).netloc if source_url else ""
    pattern = re.compile(r'\[([^\]]{3,80})\]\((https?://[^\)]{10,})\)')
    seen_urls, results = set(), []

    for match in pattern.finditer(markdown):
        text, url = match.group(1).strip(), match.group(2).strip()
        if text.startswith("!") or url.endswith((".png",".jpg",".gif",".svg",".ico")):
            continue
        if text.lower() in NOISE_TEXT or len(text) < 4:
            continue
        domain = urlparse(url).netloc
        if any(nd in domain for nd in NOISE_DOMAINS):
            continue
        if source_domain and domain == source_domain and url.count("/") <= 3:
            continue
        if url in seen_urls:
            continue
        seen_urls.add(url)
        results.append({"url": url, "label": text, "domain": domain})

    return results


def score_links_by_relevance(links: list[dict], key_terms: list[str], markdown: str, top_n: int = 3) -> list[dict]:
    if not links or not key_terms:
        return links[:top_n]

    term_set = set(t.lower() for t in key_terms)
    scored = []

    for link in links:
        score = 0
        idx = markdown.find(f"]({link['url']})")
        if idx == -1:
            idx = markdown.find(link["label"])
        if idx >= 0:
            window = markdown[max(0,idx-200):min(len(markdown),idx+200)].lower()
            score += sum(1 for t in term_set if t in window)
        label_words = set(link["label"].lower().split())
        score += len(label_words & term_set) * 2
        if len(link["label"].split()) >= 4:
            score += 1
        scored.append({**link, "score": score})

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_n]


# ══════════════════════════════════════════════════════════════════════════════
# 8. UTILITY FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def extract_entities(text: str, nlp) -> list[str]:
    doc = nlp(text[:50000])
    keep = {"ORG","PRODUCT","PERSON","GPE","WORK_OF_ART","LAW","EVENT"}
    entities, seen = [], set()
    for ent in doc.ents:
        if ent.label_ in keep:
            clean = ent.text.strip()
            key = clean.lower()
            if len(clean) > 2 and not clean.isdigit() and key not in seen:
                seen.add(key)
                entities.append(clean)
    return entities[:15]


def inject_wikilinks(content: str, concepts: list[str]) -> str:
    used, result = set(), content
    for concept in sorted(concepts, key=len, reverse=True):
        if concept.lower() in used:
            continue
        match = re.compile(re.escape(concept), re.IGNORECASE).search(result)
        if match:
            orig = match.group(0)
            result = result[:match.start()] + f"[[{orig}]]" + result[match.end():]
            used.add(concept.lower())
    return result


def extract_title(markdown: str, fallback_url: str = "") -> str:
    for line in markdown.splitlines():
        line = line.strip()
        if line.startswith("# "):
            return line[2:].strip()
        if line.startswith("## "):
            return line[3:].strip()
    if fallback_url:
        path = fallback_url.rstrip("/").split("/")[-1].replace("-"," ").replace("_"," ")
        return path.title() or "Untitled"
    return "Untitled"


def clean_markdown(raw: str) -> str:
    lines = raw.splitlines()
    cleaned = [
        l for l in lines
        if not re.match(r'^\s*(\[.+?\]\(.+?\)\s*[|·•]\s*){2,}', l)
        and not re.match(r'^\s*[-=_*]{3,}\s*$', l)
    ]
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(cleaned)).strip()


# ══════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

def process_free(raw_markdown: str, source_url: str = "") -> NLPResult:
    """
    Full free-tier NLP pipeline:
    1.  Clean markdown
    2.  Extract title
    3.  TextRank → summary + main ideas
    4.  TF-IDF → key terms + tags
    5.  Co-occurrence graph between key terms
    6.  spaCy NER → entities + wikilinks
    7.  Article stats (Flesch-Kincaid readability)
    8.  Sentiment arc across 4 sections
    9.  Key question extraction
    10. Relevant outbound link scoring
    11. Inject [[wikilinks]] into content
    """
    try:
        nlp = _load_spacy()
    except RuntimeError as e:
        return NLPResult(
            title="", summary="", tags=[], links=[], content="",
            key_terms=[], main_ideas=[], entities=[], related_links=[],
            co_occurrences=[], stats={}, sentiment_arc=[], questions=[],
            success=False, error=str(e)
        )

    try:
        # 1. Clean
        content = clean_markdown(raw_markdown)
        plain = re.sub(r'[#*`\[\]()>]', ' ', content)

        # 2. Title
        title = extract_title(raw_markdown, source_url)

        # 3. TextRank
        summary, main_ideas = textrank_summarize(plain, n_sentences=3)

        # 4. TF-IDF
        key_terms = tfidf_keywords(plain, top_n=10)
        tags = key_terms[:6]

        # 5. Co-occurrence
        co_occurrences = build_cooccurrence(plain, key_terms[:8])

        # 6. Entities + wikilinks
        entities = extract_entities(plain, nlp)
        all_concepts = entities + [t.title() for t in key_terms[:4] if t not in [e.lower() for e in entities]]
        links = list(dict.fromkeys(all_concepts))[:12]

        # 7. Stats
        stats = compute_stats(plain)

        # 8. Sentiment arc
        arc = sentiment_arc(plain, n_sections=4)

        # 9. Questions
        questions = extract_questions(plain)

        # 10. Outbound links
        raw_links = extract_outbound_links(raw_markdown, source_url)
        related_links = score_links_by_relevance(raw_links, key_terms, raw_markdown)

        # 11. Inject wikilinks
        content_with_links = inject_wikilinks(content, links)

        return NLPResult(
            title=title,
            summary=summary,
            tags=tags,
            links=links,
            content=content_with_links,
            key_terms=key_terms[:6],
            main_ideas=main_ideas,
            entities=entities[:6],
            related_links=related_links,
            co_occurrences=co_occurrences,
            stats=stats,
            sentiment_arc=arc,
            questions=questions,
            success=True,
        )

    except Exception as e:
        return NLPResult(
            title="", summary="", tags=[], links=[], content="",
            key_terms=[], main_ideas=[], entities=[], related_links=[],
            co_occurrences=[], stats={}, sentiment_arc=[], questions=[],
            success=False, error=str(e)
        )