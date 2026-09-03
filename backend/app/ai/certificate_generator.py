"""
Certificate Generation (PRD §4 Additional Features). Template-based PDF via
reportlab — fully real, no external service, no network dependency, so this
is one of the few AI-adjacent modules fully testable in any environment.
"""
import io
from datetime import date

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas


def generate_completion_certificate(
    student_name: str,
    internship_title: str,
    organization_name: str,
    completion_date: date | None = None,
) -> bytes:
    """Returns raw PDF bytes — caller decides whether to save to disk,
    stream as a download response, or attach to an email."""
    completion_date = completion_date or date.today()

    buffer = io.BytesIO()
    page_size = landscape(A4)
    c = canvas.Canvas(buffer, pagesize=page_size)
    width, height = page_size

    # Border
    c.setStrokeColor(HexColor("#0F4C81"))
    c.setLineWidth(3)
    c.rect(1 * cm, 1 * cm, width - 2 * cm, height - 2 * cm)

    c.setFont("Helvetica-Bold", 28)
    c.setFillColor(HexColor("#0F4C81"))
    c.drawCentredString(width / 2, height - 4 * cm, "Certificate of Completion")

    c.setFont("Helvetica", 14)
    c.setFillColor(HexColor("#333333"))
    c.drawCentredString(width / 2, height - 6 * cm, "NexYuva — PM Internship Scheme Platform")

    c.setFont("Helvetica", 13)
    c.drawCentredString(width / 2, height - 8.5 * cm, "This certifies that")

    c.setFont("Helvetica-Bold", 22)
    c.setFillColor(HexColor("#0F4C81"))
    c.drawCentredString(width / 2, height - 10 * cm, student_name)

    c.setFont("Helvetica", 13)
    c.setFillColor(HexColor("#333333"))
    c.drawCentredString(
        width / 2, height - 12 * cm,
        f"has successfully completed the internship \"{internship_title}\""
    )
    c.drawCentredString(width / 2, height - 13.2 * cm, f"at {organization_name}")

    c.setFont("Helvetica", 11)
    c.drawCentredString(
        width / 2, height - 15.5 * cm,
        f"Issued on {completion_date.strftime('%B %d, %Y')}"
    )

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()
