"""Pydantic schemas for Module 5.5 (Smart Scheduling)."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CalendarStatusResponse(BaseModel):
    connected: bool
    google_email: str | None = None
    connected_at: datetime | None = None


class SlotIn(BaseModel):
    start: datetime
    end: datetime


class ProposeSlotsRequest(BaseModel):
    slots: list[SlotIn] = Field(..., min_length=1, max_length=10)
    duration_minutes: int = 30


class SelectSlotRequest(BaseModel):
    slot_index: int = Field(..., ge=0)


class ScheduledInterviewResponse(BaseModel):
    id: UUID
    application_id: UUID
    organization_id: UUID
    student_id: UUID
    internship_id: UUID
    status: str
    proposed_slots: list[dict]
    selected_slot: dict | None
    duration_minutes: int
    meet_link: str | None
    created_at: datetime
    confirmed_at: datetime | None
    cancelled_at: datetime | None

    # Denormalized display fields filled in by the route, not stored on the model
    internship_title: str | None = None
    organization_name: str | None = None
    student_name: str | None = None

    model_config = {"from_attributes": True}
