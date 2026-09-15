export type Business = {
  id: string;
  clerk_org_id: string;
  name: string;
  business_type: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  timezone: string;
  sla_minutes: number | null;
  next_assignment_cursor: number;
  widget_accent_color: string | null;
  widget_logo_url: string | null;
  widget_welcome_text: string | null;
  widget_welcome_text_closed: string | null;
  widget_cta_text: string | null;
  widget_position: WidgetPosition;
  widget_language: WidgetLanguage;
  widget_suggested_questions: string[] | null;
  recommend_products_enabled: boolean;
  published_at: string | null;
  appointments_enabled: boolean;
  appointment_slot_minutes: number;
  created_at: string;
  updated_at: string;
};

export type WidgetPosition = "bottom-right" | "bottom-left";
export type WidgetLanguage = "en" | "es" | "fr" | "de" | "pt" | "hi";

export type BusinessHours = {
  business_id: string;
  day_of_week: number;
  is_open: boolean;
  start_time: string | null;
  end_time: string | null;
};

/**
 * A per-date scheduling override on top of the recurring weekly
 * `business_hours` (Phase C follow-up, 2026-09-10). `is_closed: true`
 * with a null start/end closes the whole date; with a start/end it
 * closes just that window (e.g. a lunch break). `is_closed: false`
 * always carries a start/end -- an exceptional opening that overrides
 * the normal weekly hours for that one date.
 */
export type BusinessHoursException = {
  id: string;
  business_id: string;
  date: string;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: string;
};

export type WidgetKeyStatus = "active" | "revoked";

export type WidgetKey = {
  id: string;
  business_id: string;
  key: string;
  name: string | null;
  allowed_origins: string[];
  status: WidgetKeyStatus;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

/** Stage 2 (STATE.md): gates a catalog row extracted from a knowledge document behind human review before it's answerable by the AI. Every manually-created row keeps the 'approved' default -- only lib/knowledge-extraction.ts ever inserts 'draft'. */
export type CatalogItemStatus = "draft" | "approved";

export type Product = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price: string | null;
  image_url: string | null;
  category: string | null;
  price_amount: number | null;
  status: CatalogItemStatus;
  extracted_from_document_id: string | null;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price: string | null;
  image_url: string | null;
  category: string | null;
  price_amount: number | null;
  status: CatalogItemStatus;
  extracted_from_document_id: string | null;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
};

export type Faq = {
  id: string;
  business_id: string;
  question: string;
  answer: string;
  status: CatalogItemStatus;
  extracted_from_document_id: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeSourceType = "manual" | "product" | "service" | "faq" | "file" | "url";

export type IngestionStatus = "pending" | "processing" | "complete" | "failed";

export type KnowledgeDocumentStatus = "draft" | "published";

export type KnowledgeDocument = {
  id: string;
  business_id: string;
  source_type: KnowledgeSourceType;
  source_id: string | null;
  title: string;
  content: string;
  ingestion_status: IngestionStatus;
  ingestion_attempts: number;
  ingestion_last_error: string | null;
  ingestion_next_attempt_at: string;
  ingestion_updated_at: string | null;
  status: KnowledgeDocumentStatus;
  version: number;
  published_at: string | null;
  source_url: string | null;
  storage_path: string | null;
  refresh_interval_hours: number | null;
  last_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeDocumentVersion = {
  id: string;
  document_id: string;
  business_id: string;
  version: number;
  title: string;
  content: string;
  published_by: string;
  published_at: string;
};

export type KnowledgeChunk = {
  id: string;
  business_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  char_count: number;
  embedding: number[] | null;
  created_at: string;
};

export type ConversationControl = "ai" | "human";

export type Conversation = {
  id: string;
  business_id: string;
  source: string | null;
  source_url: string | null;
  visitor_id: string | null;
  control: ConversationControl;
  needs_attention: boolean;
  consent_given: boolean;
  consent_given_at: string | null;
  assigned_to_user_id: string | null;
  attention_flagged_at: string | null;
  created_at: string;
  ai_summary: string | null;
  ai_summary_generated_at: string | null;
  ai_summary_message_count: number | null;
  customer_id: string | null;
};

export type MessageRole = "user" | "assistant" | "human_agent";

export type Message = {
  id: string;
  business_id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  source_chunk_ids: string[];
  grounded: boolean | null;
  created_at: string;
};

export type UnansweredQuestion = {
  id: string;
  business_id: string;
  conversation_id: string;
  question: string;
  created_at: string;
};

export type LeadInterestType = "product" | "service" | "general";
export type LeadQualification = "hot" | "warm" | "cold";
export type LeadStatus = "new" | "contacted" | "converted" | "lost";

export type Lead = {
  id: string;
  business_id: string;
  conversation_id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  interest_type: LeadInterestType | null;
  interest_id: string | null;
  notes: string | null;
  qualification: LeadQualification;
  qualification_reason: string;
  score: number;
  status: LeadStatus;
  source: string | null;
  requested_callback: boolean;
  appointment_booked: boolean;
  follow_up_message: string | null;
  follow_up_status: LeadFollowUpStatus | null;
  follow_up_sent_at: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Phase 28: one itemized point in a lead's deterministic score breakdown -- see lib/lead-scoring.ts's scoreLead(). */
export type LeadScoreReasonItem = { label: string; points: number };

/** Phase 28: a persisted snapshot of a lead's score at the moment it changed -- lib/lead-score-history.ts. Read-only from the dashboard; only the service role writes it, alongside every scoreLead() call. */
export type LeadScoreHistoryEntry = {
  id: string;
  business_id: string;
  lead_id: string;
  score: number;
  qualification: LeadQualification;
  reasons: LeadScoreReasonItem[];
  created_at: string;
};

export type LeadFollowUpStatus =
  | "sent_email"
  | "sent_whatsapp"
  | "blocked_no_whatsapp_template"
  | "blocked_no_instagram_window"
  | "no_contact_channel"
  | "send_failed";

/** Phase 27: a business-scoped tag catalog entry. Reuses Badge's own 5-tone vocabulary (`BadgeTone`) as a rendering choice -- see the migration's own comment for why. */
export type TagColor = "warning" | "success" | "danger" | "muted" | "accent";

export type LeadTag = {
  id: string;
  business_id: string;
  name: string;
  color: TagColor;
  created_at: string;
};

/**
 * Phase C: booking always starts 'pending' (the user's confirmed choice --
 * owner approval required, the AI's book_appointment tool never inserts
 * 'confirmed' directly). A human moves it to 'confirmed'/'declined' from
 * the dashboard; a confirmed appointment can later be 'cancelled' (before
 * its time) or, once its time has passed, marked 'completed'/'no_show'
 * (2026-09-10 follow-up -- whether the meeting actually happened).
 */
export type AppointmentStatus = "pending" | "confirmed" | "declined" | "cancelled" | "completed" | "no_show";

export type Appointment = {
  id: string;
  business_id: string;
  conversation_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  notes: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Phase 28 (Customer Intelligence foundation): a business-scoped
 * customer/prospect identity aggregating conversations, leads, and
 * appointments across channels. Created and matched only by
 * lib/customers.ts's resolveOrCreateCustomer() -- conservative,
 * deterministic (exact normalized email/phone equality), never fuzzy or
 * AI-merged. `email_key`/`phone_key` are DB-generated columns, not
 * writable directly.
 */
export type Customer = {
  id: string;
  business_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  email_key: string | null;
  phone_key: string | null;
  first_seen_at: string;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

/** Phase 28: a segment's structured rule -- one top-level AND/OR over a flat, allow-listed condition list. Validated server-side by lib/schemas/segment.ts; never interpolated into raw SQL. */
export type SegmentMatchType = "all" | "any";

export type SegmentConditionField =
  | "score"
  | "status"
  | "qualification"
  | "channel"
  | "has_email"
  | "has_phone"
  | "has_conversation"
  | "has_appointment"
  | "appointment_status"
  | "needs_attention"
  | "human_controlled"
  | "tag"
  | "no_tag"
  | "interest_type"
  | "last_activity_hours"
  | "conversation_age_hours";

export type SegmentConditionOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "exists" | "not_exists";

export type SegmentCondition = {
  field: SegmentConditionField;
  operator: SegmentConditionOperator;
  value: string | number | boolean | null;
};

export type Segment = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  match_type: SegmentMatchType;
  conditions: SegmentCondition[];
  created_at: string;
  updated_at: string;
};

/**
 * A single manually-blocked appointment slot (2026-09-10 follow-up), for
 * the visual slot-grid UI -- distinct from `BusinessHoursException`,
 * which blocks a whole date or a time range within one; this blocks one
 * exact slot instant, so several independent slots on the same date can
 * each be toggled off separately.
 */
export type AppointmentBlockedSlot = {
  id: string;
  business_id: string;
  starts_at: string;
  reason: string | null;
  created_at: string;
};

export type WebhookEndpointStatus = "active" | "disabled";

export type WebhookEndpoint = {
  id: string;
  business_id: string;
  url: string;
  secret: string;
  status: WebhookEndpointStatus;
  created_at: string;
};

export type WhatsappConnectionStatus = "pending" | "connected" | "error" | "disconnected";

export type WhatsappConnection = {
  id: string;
  business_id: string;
  phone_number_id: string;
  waba_id: string;
  display_phone_number: string;
  verified_name: string | null;
  status: WhatsappConnectionStatus;
  last_verified_at: string | null;
  last_error: string | null;
  connected_at: string | null;
  access_token_last4: string | null;
  created_at: string;
  updated_at: string | null;
};

export type InstagramConnectionStatus = "pending" | "connected" | "error" | "disconnected";

export type InstagramConnection = {
  id: string;
  business_id: string;
  instagram_business_account_id: string;
  ig_username: string | null;
  status: InstagramConnectionStatus;
  token_expires_at: string | null;
  access_token_last4: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string | null;
};

/** Phase 29 (Automation & Workflow Engine): which real event a workflow listens for. `trigger_config` carries any event-specific filter (which status, which tag, which threshold), checked by the dispatcher before `conditions` are even evaluated. */
export type WorkflowTriggerType =
  | "lead_created"
  | "lead_status_changed"
  | "lead_score_threshold"
  | "tag_added"
  | "tag_removed"
  | "appointment_status_changed"
  | "conversation_needs_attention"
  | "human_takeover"
  | "ai_handback"
  | "no_activity_hours";

export type WorkflowTriggerConfig = {
  status?: string;
  threshold?: number;
  tagId?: string | null;
  hours?: number;
};

/** A workflow's ordered step list -- a "wait" step pauses the run (persisted, durable across restarts via `workflow_runs.resume_at`); every other step is a real action executed immediately. */
export type WorkflowWaitStep = { type: "wait"; unit: "minutes" | "hours" | "days"; amount: number };

export type WorkflowActionStep =
  | { type: "add_tag"; tagId: string }
  | { type: "remove_tag"; tagId: string }
  | { type: "update_lead_status"; status: LeadStatus }
  | { type: "flag_attention" }
  | { type: "assign_owner" }
  | { type: "create_task"; title: string; description: string | null }
  | { type: "generate_followup_draft" }
  | { type: "internal_notification"; message: string }
  | { type: "email_notification"; subject: string; message: string };

export type WorkflowStep = WorkflowWaitStep | WorkflowActionStep;

export type Workflow = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  trigger_type: WorkflowTriggerType;
  trigger_config: WorkflowTriggerConfig;
  match_type: SegmentMatchType;
  conditions: SegmentCondition[];
  steps: WorkflowStep[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkflowRunStatus = "queued" | "running" | "completed" | "failed" | "skipped" | "cancelled";
export type WorkflowRunTargetType = "lead" | "conversation" | "customer";

export type WorkflowRun = {
  id: string;
  business_id: string;
  workflow_id: string;
  trigger_event: string;
  target_type: WorkflowRunTargetType;
  target_id: string;
  customer_id: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  status: WorkflowRunStatus;
  steps: WorkflowStep[];
  next_step_index: number;
  resume_at: string;
  attempts: number;
  failure_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesTaskStatus = "open" | "done" | "dismissed";

export type SalesTask = {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  status: SalesTaskStatus;
  assigned_to_user_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  workflow_run_id: string | null;
  step_index: number | null;
  created_at: string;
  updated_at: string;
};

export type InternalNotification = {
  id: string;
  business_id: string;
  target_user_id: string | null;
  message: string;
  link: string | null;
  workflow_run_id: string | null;
  step_index: number | null;
  read_at: string | null;
  created_at: string;
};

export type CopilotDismissal = {
  id: string;
  business_id: string;
  customer_id: string;
  reason_keys: string[];
  dismissed_at: string;
  dismissed_by: string;
  created_at: string;
};

export type CopilotActionType = "reply_to_prospect" | "confirm_appointment" | "follow_up" | "review_stalled_conversation" | "handle_attention";

export type CopilotActionStatus = "open" | "snoozed" | "completed" | "dismissed" | "superseded" | "expired";

export type CopilotAction = {
  id: string;
  business_id: string;
  customer_id: string;
  action_type: CopilotActionType;
  status: CopilotActionStatus;
  priority: number;
  reason_keys: string[];
  title: string;
  recommended_action: string;
  snoozed_until: string | null;
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  superseded_at: string | null;
  superseded_by_action_id: string | null;
  expired_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditLogAction =
  | "conversation.control_changed"
  | "conversation.attention_dismissed"
  | "knowledge.deleted"
  | "knowledge.published"
  | "knowledge.unpublished"
  | "widget_key.created"
  | "widget_key.origins_updated"
  | "widget_key.revoked"
  | "webhook_endpoint.created"
  | "webhook_endpoint.deleted"
  | "business_hours.updated"
  | "widget_branding.updated"
  | "business.published"
  | "widget_suggested_questions.updated"
  | "ai_conversion_goal.updated"
  | "appointment_settings.updated"
  | "appointment.confirmed"
  | "appointment.declined"
  | "appointment.cancelled"
  | "ai_capabilities.updated"
  | "whatsapp_connection.created"
  | "whatsapp_connection.deleted"
  | "appointment_exception.created"
  | "appointment_exception.deleted"
  | "appointment.completed"
  | "appointment.no_show"
  | "appointment_slot_block.created"
  | "appointment_slot_block.deleted"
  | "instagram_connection.created"
  | "instagram_connection.deleted"
  | "customer.renamed"
  | "segment.created"
  | "segment.updated"
  | "segment.deleted"
  | "workflow.created"
  | "workflow.updated"
  | "workflow.deleted"
  | "workflow.enabled"
  | "workflow.disabled"
  | "workflow_run.cancelled"
  | "copilot.item_dismissed"
  | "copilot.item_undismissed"
  | "copilot.action_snoozed"
  | "copilot.action_completed"
  | "copilot.action_superseded";

export type AuditLogMetadata = Record<string, string | number | boolean | null>;

export type AuditLogEntry = {
  id: string;
  business_id: string;
  actor_user_id: string;
  action: AuditLogAction;
  target_type: string;
  target_id: string;
  metadata: AuditLogMetadata | null;
  created_at: string;
};
