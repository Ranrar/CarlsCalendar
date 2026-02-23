# Security Incident Runbook

This document defines the incident response process for CarlsCalendar.

## Scope

Applies to all security incidents involving:
- unauthorized access to personal data,
- data loss/corruption with potential privacy impact,
- compromised credentials, sessions, tokens, or infrastructure,
- suspected or confirmed GDPR-relevant personal data breaches.

## Roles

- **Incident Commander (IC):** Coordinates response and communications.
- **Technical Lead:** Investigates root cause, containment, and remediation.
- **Privacy Lead (DPO function):** Assesses GDPR impact and reporting obligations.
- **Communications Lead:** Handles user/customer updates.

## Severity Levels

- **Low:** No confirmed personal data exposure; contained quickly.
- **Medium:** Limited exposure risk; no high-risk categories.
- **High:** Confirmed personal data exposure affecting multiple users.
- **Critical:** Large-scale breach, sensitive data involved, active attacker, or legal/regulatory urgency.

## 0-72 Hour Timeline (GDPR-Aligned)

### 0-2 hours: Detection and triage

1. Create/Update `breach_logs` entry with:
   - severity,
   - title and description,
   - initial affected-record estimate,
   - status `open`.
2. Assign Incident Commander.
3. Preserve volatile evidence (logs, traces, infra snapshots).
4. Start incident channel and case timeline.

### 2-12 hours: Containment and initial assessment

1. Contain attack vector (disable tokens/sessions, rotate secrets, block abusive IPs, isolate services).
2. Confirm likely data categories impacted.
3. Estimate potentially affected users and records.
4. Update breach status to `investigating`.

### 12-24 hours: Impact analysis and legal assessment

1. Determine whether incident qualifies as personal data breach under GDPR.
2. Assess risk to rights and freedoms of data subjects.
3. Document decision rationale.
4. Prepare draft regulator notice and user communication templates.

### 24-48 hours: Notification decision and execution prep

1. If notifiable, finalize competent authority report package.
2. If high risk to individuals, prepare direct subject notifications.
3. Validate remediation workstream and compensating controls.

### 48-72 hours: Formal notification and remediation plan

1. Submit authority notification when required (within 72 hours of awareness).
2. Send user notifications when required.
3. Update breach entry fields:
   - `authority_notified`,
   - `data_subjects_notified`,
   - `reported_at`,
   - status (`contained`/`resolved` when appropriate).

## Mandatory Evidence Checklist

- Incident timeline with timestamps.
- Root-cause narrative and affected systems.
- List of impacted data categories and estimated scope.
- Containment actions and validation evidence.
- Notification decisions and legal rationale.
- Post-incident remediation and prevention actions.

## Communications Principles

- Be factual, timely, and transparent.
- Avoid speculation; clearly label unknowns.
- Keep all public communication consistent with legal review.

## Recovery and Postmortem

Within 5 business days of resolution:

1. Complete blameless postmortem.
2. Record corrective actions with owners/due dates.
3. Add or update retention/compliance controls if needed.
4. Review and adjust incident severity rubric and monitoring.

## Operational Commands (Internal)

- Trigger immediate retention cleanup: `POST /api/v1/admin/compliance/retention/cleanup`
- List breach log entries: `GET /api/v1/admin/compliance/breach-logs`
- Update breach status and notifications: `PUT /api/v1/admin/compliance/breach-logs/{id}`

---

Owner: Security & Privacy Team  
Review cadence: Quarterly or after each high/critical incident.
