"""
Sentiment Analysis on Feedback (PRD §4). VADER is a lexicon/rule-based
sentiment tool — no model download, no network dependency, so unlike the
sentence-transformer embeddings this is fully testable in any environment,
including this sandbox. Well-suited to short, informal feedback text
(VADER was built for social-media-style text, which post-internship
feedback resembles more than formal writing).
"""
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

_analyzer = SentimentIntensityAnalyzer()


def analyze_feedback_sentiment(feedback_text: str) -> dict:
    """
    Returns VADER's compound score (-1 to +1) plus a simple categorical
    label. Real, deterministic output — no randomness, no external call.
    """
    scores = _analyzer.polarity_scores(feedback_text)
    compound = scores["compound"]

    if compound >= 0.05:
        label = "positive"
    elif compound <= -0.05:
        label = "negative"
    else:
        label = "neutral"

    return {
        "compound_score": round(compound, 3),
        "label": label,
        "positive": round(scores["pos"], 3),
        "neutral": round(scores["neu"], 3),
        "negative": round(scores["neg"], 3),
    }
