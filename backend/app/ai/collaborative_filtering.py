"""
Collaborative Filtering (PRD §4). Cold-start reality: a brand-new platform
has zero real interaction history. Rules.md is explicit that this must be
"documented honestly as bootstrapped, designed to retrain on real usage as
it accumulates" — not hidden behind a confident-looking number.

This module seeds synthetic student-internship interactions using a simple
rule (students with overlapping skill-domains "would plausibly" apply/save/
complete), builds an item-item similarity matrix from that synthetic data,
and exposes a score function. Once real application/completion/feedback data
exists, swap `generate_synthetic_interactions` for a real query and retrain —
the rest of the pipeline (matrix build, scoring) doesn't need to change.
"""
import numpy as np


def generate_synthetic_interactions(
    student_ids: list[str],
    student_skill_sets: dict[str, set[str]],
    internship_ids: list[str],
    internship_skill_sets: dict[str, set[str]],
    seed: int = 42,
) -> np.ndarray:
    """
    Synthetic interaction matrix (students x internships), values in [0, 1].
    Rule: base interaction likelihood on skill-overlap ratio, plus a small
    random jitter so the matrix isn't perfectly deterministic (real user
    behavior has noise; a matrix with zero noise would make the "collaborative"
    signal indistinguishable from content-based, defeating the point of
    seeding it at all).
    """
    rng = np.random.default_rng(seed)
    matrix = np.zeros((len(student_ids), len(internship_ids)))

    for i, sid in enumerate(student_ids):
        s_skills = student_skill_sets.get(sid, set())
        for j, iid in enumerate(internship_ids):
            i_skills = internship_skill_sets.get(iid, set())
            if not i_skills:
                continue
            overlap_ratio = len(s_skills & i_skills) / len(i_skills)
            jitter = rng.normal(0, 0.05)
            matrix[i, j] = max(0.0, min(1.0, overlap_ratio + jitter))

    return matrix


def item_item_similarity(interaction_matrix: np.ndarray) -> np.ndarray:
    """Cosine similarity between internship columns based on synthetic
    interaction patterns — standard item-based CF, just fed bootstrapped
    data instead of real logs until real logs exist."""
    norms = np.linalg.norm(interaction_matrix, axis=0, keepdims=True)
    norms[norms == 0] = 1e-9  # avoid divide-by-zero for internships with no signal
    normalized = interaction_matrix / norms
    return normalized.T @ normalized


def collaborative_score(
    student_index: int,
    internship_index: int,
    interaction_matrix: np.ndarray,
    similarity_matrix: np.ndarray,
    min_similarity_mass: float = 0.3,
) -> float:
    """
    Predicted affinity for (student, internship) = weighted average of the
    student's synthetic interactions with similar internships, excluding
    the target internship itself.

    `min_similarity_mass` guards against a real instability found while
    testing this: when an internship has no good neighbors, similarity_total
    can be tiny (e.g. 0.06), and dividing by it amplifies one noisy weak
    correlation into a misleadingly confident-looking score. Below this
    threshold there isn't enough neighborhood signal to trust, so this
    returns 0.0 (no confident CF signal) rather than an unstable number —
    the hybrid combiner should lean on the content-based score instead in
    that case.
    """
    similarities = similarity_matrix[internship_index].copy()
    similarities[internship_index] = 0  # exclude self

    student_interactions = interaction_matrix[student_index]
    weighted_sum = float(np.dot(similarities, student_interactions))
    similarity_total = float(np.sum(np.abs(similarities)))

    if similarity_total < min_similarity_mass:
        return 0.0

    return round(min(max(weighted_sum / similarity_total, 0.0), 1.0), 3)
