export type Business = {
  id: string;
  clerk_org_id: string;
  name: string;
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

export type KnowledgeDocument = {
  id: string;
  business_id: string;
  source_type: KnowledgeSourceType;
  source_id: string | null;
  title: string;
  content: string;
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
  created_at: string;
};
