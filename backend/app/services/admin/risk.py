"""
Deterministic, explainable risk signal for the company verification queue.

Deliberately NOT an AI/ML model and NOT a black box -- every signal here is
a plain rule the admin can see and understand (returned in the notes
string). This exists to help an admin *prioritize* which cases to look at
first; it must never be used to auto-approve or auto-reject a company (see
ADMIN_TRUST_SAFETY_MEMO.md, "Explicitly out of scope").
"""
from urllib.parse import urlparse

from app.core.models import DocumentReviewStatus, Organization, VerificationRiskLevel

# Free/consumer email providers -- a recruiter registering from one of these
# instead of an official company domain is the single strongest low-effort
# fraud signal available before any document review happens.
_FREE_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "rediffmail.com",
    "protonmail.com", "icloud.com", "aol.com", "live.com", "mail.com",
}


def _domain_of(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip().lower()
    if "@" in value:
        return value.rsplit("@", 1)[-1]
    if "://" not in value:
        value = "https://" + value
    netloc = urlparse(value).netloc
    return netloc[4:] if netloc.startswith("www.") else netloc or None


def compute_risk(
    org: Organization,
    user_email: str,
    documents: list,
) -> tuple[VerificationRiskLevel, str]:
    """
    Returns (risk_level, human-readable notes). `documents` is the org's
    VerificationDocument list (empty if none uploaded yet under the new
    multi-doc flow -- the legacy single-doc field is checked separately).
    """
    signals: list[str] = []
    high_flags = 0
    review_flags = 0

    email_domain = _domain_of(user_email)
    website_domain = _domain_of(org.official_website)

    if email_domain in _FREE_EMAIL_DOMAINS:
        review_flags += 1
        signals.append(f"Registered with a free email provider ({email_domain})")
    elif website_domain and email_domain and website_domain != email_domain:
        review_flags += 1
        signals.append(f"Email domain ({email_domain}) doesn't match website ({website_domain})")
    elif website_domain and email_domain and website_domain == email_domain:
        signals.append("Email domain matches official website")
    else:
        review_flags += 1
        signals.append("No official website on file to cross-check against")

    has_any_document = bool(documents) or bool(org.verification_doc_path)
    if not has_any_document:
        high_flags += 1
        signals.append("No verification documents uploaded")
    else:
        rejected_docs = [d for d in documents if d.status == DocumentReviewStatus.REJECTED]
        if rejected_docs:
            review_flags += 1
            signals.append(f"{len(rejected_docs)} document(s) previously rejected")
        verified_docs = [d for d in documents if d.status == DocumentReviewStatus.VERIFIED]
        if documents and not verified_docs:
            review_flags += 1
            signals.append("Documents uploaded but none verified yet")

    if not org.legal_name or not org.pan:
        review_flags += 1
        signals.append("Legal name or PAN not provided")

    if not org.representative_name or not org.representative_designation:
        review_flags += 1
        signals.append("Representative name/designation not provided")
    elif not org.representative_email_verified:
        signals.append("Representative email not yet verified")

    if not org.description or len(org.description.strip()) < 30:
        review_flags += 1
        signals.append("Company description is missing or very thin")

    if high_flags > 0:
        level = VerificationRiskLevel.HIGH
    elif review_flags >= 1:
        level = VerificationRiskLevel.REVIEW
    else:
        level = VerificationRiskLevel.LOW
        signals.append("All core identity signals check out")

    return level, "; ".join(signals)
