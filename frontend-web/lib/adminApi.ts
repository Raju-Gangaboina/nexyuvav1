// Trust & Safety Control Center — API client for the Phase 1 backend
// (see ADMIN_TRUST_SAFETY_MEMO.md). Kept in its own file rather than
// bolted onto realApi.ts's existing legacy PendingOrganization functions
// (getPendingOrganizationsReal/approveOrganizationReal/rejectOrganizationReal),
// which stay in place as deprecated aliases for the old /admin/dashboard
// widget so nothing there breaks.

import { getRealToken } from './realApi';

const REAL_API_BASE = process.env.NEXT_PUBLIC_REAL_API_URL || 'http://localhost:8000/api/v1';

function authHeaders() {
  const token = getRealToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function handle(res: Response) {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch { /* ignore */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return res.json();
}

export type VerificationStatus = 'unsubmitted' | 'pending' | 'action_required' | 'approved' | 'rejected' | 'suspended';
export type RiskLevel = 'low' | 'review' | 'high';
export type DocumentType = 'incorporation_certificate' | 'pan_card' | 'gst_certificate' | 'msme_certificate' | 'other';
export type DocumentReviewStatus = 'pending' | 'verified' | 'rejected';

export interface QueueItem {
  id: string;
  name: string;
  legal_name: string | null;
  description: string | null;
  status: VerificationStatus;
  risk_level: RiskLevel;
  risk_notes: string | null;
  verification_doc_name: string | null;
  submitted_at: string | null;
}

export async function getVerificationQueue(opts?: { status?: VerificationStatus; risk?: RiskLevel }): Promise<QueueItem[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.risk) params.set('risk', opts.risk);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/verification-queue${qs}`, { headers: authHeaders() });
  return handle(res);
}

export interface CaseDocument {
  id: string;
  doc_type: DocumentType;
  file_name: string;
  uploaded_at: string;
  status: DocumentReviewStatus;
  reviewed_at: string | null;
  review_notes: string | null;
}

export interface AuditEvent {
  admin_email: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  created_at: string;
}

export interface VerificationCase {
  id: string;
  status: VerificationStatus;
  identity: {
    display_name: string;
    legal_name: string | null;
    cin: string | null;
    pan: string | null;
    official_website: string | null;
    industry: string | null;
    description: string | null;
    account_email: string | null;
    account_created_at: string | null;
  };
  representative: {
    name: string | null;
    designation: string | null;
    phone: string | null;
    email_verified: boolean;
    phone_verified: boolean;
  };
  documents: CaseDocument[];
  legacy_document: { file_name: string; submitted_at: string | null } | null;
  risk: { level: RiskLevel; notes: string | null };
  activity: { internships_posted: number; applications_received: number };
  rejection_reason: string | null;
  action_required_reason: string | null;
  audit_history: AuditEvent[];
}

export async function getVerificationCase(orgId: string): Promise<VerificationCase> {
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/${orgId}/case`, { headers: authHeaders() });
  return handle(res);
}

export async function approveOrganization(orgId: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/${orgId}/approve`, { method: 'POST', headers: authHeaders() });
  return handle(res);
}

export async function rejectOrganization(orgId: string, reason?: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/${orgId}/reject`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ reason }),
  });
  return handle(res);
}

export async function requestInformation(orgId: string, reason: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/${orgId}/request-information`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ reason }),
  });
  return handle(res);
}

export async function suspendOrganization(orgId: string, reason: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/${orgId}/suspend`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ reason }),
  });
  return handle(res);
}

export async function reinstateOrganization(orgId: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/${orgId}/reinstate`, { method: 'POST', headers: authHeaders() });
  return handle(res);
}

export async function reviewDocument(orgId: string, docId: string, status: DocumentReviewStatus, notes?: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/${orgId}/documents/${docId}/review`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ status, notes }),
  });
  return handle(res);
}

export function documentDownloadUrl(orgId: string, docId: string): string {
  return `${REAL_API_BASE}/admin/organizations/${orgId}/documents/${docId}/download`;
}

export async function downloadDocumentBlob(orgId: string, docId: string): Promise<Blob> {
  const token = getRealToken();
  const res = await fetch(documentDownloadUrl(orgId, docId), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Could not download document');
  return res.blob();
}

export async function downloadLegacyDocumentBlob(orgId: string): Promise<Blob> {
  const token = getRealToken();
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/${orgId}/verification-document`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Could not download document');
  return res.blob();
}

export interface AuditLogEvent extends AuditEvent {
  entity_type: string;
  entity_id: string;
}

export async function getAuditLog(opts?: { entityType?: string; limit?: number }): Promise<AuditLogEvent[]> {
  const params = new URLSearchParams();
  if (opts?.entityType) params.set('entity_type', opts.entityType);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${REAL_API_BASE}/admin/audit-log${qs}`, { headers: authHeaders() });
  return handle(res);
}

// --- Company-side: verification profile + typed multi-doc upload ---

export interface VerificationProfileUpdate {
  legal_name?: string; cin?: string; pan?: string; official_website?: string; industry?: string;
  representative_name?: string; representative_designation?: string; representative_phone?: string;
}

export async function updateVerificationProfile(payload: VerificationProfileUpdate) {
  const res = await fetch(`${REAL_API_BASE}/organizations/me/verification-profile`, {
    method: 'PATCH', headers: authHeaders(), body: JSON.stringify(payload),
  });
  return handle(res);
}

export interface MyVerificationDocument {
  id: string; doc_type: DocumentType; file_name: string; uploaded_at: string;
  status: DocumentReviewStatus; review_notes: string | null;
}

export async function uploadTypedVerificationDocument(file: File, docType: DocumentType): Promise<MyVerificationDocument> {
  const token = getRealToken();
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${REAL_API_BASE}/organizations/verification-documents?doc_type=${docType}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
  });
  return handle(res);
}

export async function getMyVerificationDocuments(): Promise<MyVerificationDocument[]> {
  const res = await fetch(`${REAL_API_BASE}/organizations/me/verification-documents`, { headers: authHeaders() });
  return handle(res);
}

// --- Internship moderation (Phase 3) ---

export type ModerationStatus = 'unreviewed' | 'approved' | 'flagged' | 'removed';

export interface ModerationQueueItem {
  id: string;
  title: string;
  organization_id: string;
  organization_name: string;
  domain: string;
  location: string;
  stipend: number | null;
  description: string;
  moderation_status: ModerationStatus;
  moderation_notes: string | null;
  is_active: boolean;
  created_at: string;
}

export async function getModerationQueue(status?: ModerationStatus): Promise<ModerationQueueItem[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await fetch(`${REAL_API_BASE}/admin/internships/moderation-queue${qs}`, { headers: authHeaders() });
  return handle(res);
}

export async function approveInternshipListing(internshipId: string, notes?: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/internships/${internshipId}/approve`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ notes }),
  });
  return handle(res);
}

export async function flagInternshipListing(internshipId: string, notes: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/internships/${internshipId}/flag`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ notes }),
  });
  return handle(res);
}

export async function removeInternshipListing(internshipId: string, notes?: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/internships/${internshipId}/remove`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ notes }),
  });
  return handle(res);
}

// --- Student reports (Phase 4) ---

export type ReportTargetType = 'internship' | 'organization';
export type ReportReason =
  | 'fake_listing' | 'unpaid_or_underpaid' | 'misleading_description'
  | 'suspicious_company' | 'harassment' | 'scam_or_fraud' | 'other';
export type ReportStatus = 'open' | 'investigating' | 'dismissed' | 'action_taken';

export interface ReportQueueItem {
  id: string;
  reporter_id: string;
  reporter_email: string | null;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  details: string | null;
  evidence_path: string | null;
  status: ReportStatus;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export async function getReportsQueue(status?: ReportStatus): Promise<ReportQueueItem[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await fetch(`${REAL_API_BASE}/admin/reports${qs}`, { headers: authHeaders() });
  return handle(res);
}

export async function investigateReport(reportId: string, notes?: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/reports/${reportId}/investigate`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ notes }),
  });
  return handle(res);
}

export async function dismissReport(reportId: string, notes?: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/reports/${reportId}/dismiss`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ notes }),
  });
  return handle(res);
}

export async function actionTakenReport(reportId: string, notes?: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/reports/${reportId}/action-taken`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ notes }),
  });
  return handle(res);
}
