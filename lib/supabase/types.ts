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
