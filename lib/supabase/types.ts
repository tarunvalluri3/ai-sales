export type Business = {
  id: string;
  clerk_org_id: string;
  name: string;
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
  ai_conversion_goal: AiConversionGoal;
  published_at: string | null;
  appointments_enabled: boolean;
  appointment_slot_minutes: number;
  created_at: string;
  updated_at: string;
};

export type WidgetPosition = "bottom-right" | "bottom-left";
export type WidgetLanguage = "en" | "es" | "fr" | "de" | "pt" | "hi";
export type AiConversionGoal = "generate_leads" | "recommend_products";

export type BusinessHours = {
  business_id: string;
  day_of_week: number;
  is_open: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type WidgetKeyStatus = "active" | "revoked";

export type WidgetKey = {
  id: string;
  business_id: string;
  key: string;
  allowed_origins: string[];
  status: WidgetKeyStatus;
  created_at: string;
  revoked_at: string | null;
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
  status: LeadStatus;
  source: string | null;
  requested_callback: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Phase C: booking always starts 'pending' (the user's confirmed choice --
 * owner approval required, the AI's book_appointment tool never inserts
 * 'confirmed' directly). A human moves it to 'confirmed'/'declined' from
 * the dashboard; a confirmed appointment can later be 'cancelled'.
 */
export type AppointmentStatus = "pending" | "confirmed" | "declined" | "cancelled";

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
  created_at: string;
  updated_at: string;
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
  | "appointment.cancelled";

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
