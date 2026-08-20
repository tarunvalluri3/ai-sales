export type Business = {
  id: string;
  clerk_org_id: string;
  name: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  widget_key: string;
  widget_allowed_origin: string | null;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price: string | null;
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  price: string | null;
  created_at: string;
  updated_at: string;
};

export type Faq = {
  id: string;
  business_id: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
};

export type KnowledgeSourceType = "manual" | "product" | "service" | "faq";

export type IngestionStatus = "pending" | "processing" | "complete" | "failed";

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
  created_at: string;
  updated_at: string;
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
  control: ConversationControl;
  needs_attention: boolean;
  consent_given: boolean;
  consent_given_at: string | null;
  created_at: string;
};

export type MessageRole = "user" | "assistant" | "human_agent";

export type Message = {
  id: string;
  business_id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
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

export type AuditLogAction =
  | "conversation.control_changed"
  | "conversation.attention_dismissed"
  | "knowledge.deleted";

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
