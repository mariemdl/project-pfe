export interface ExtractedField {
  name: string;
  value: string;
  confidence: number;
}

export interface ExtractedDocument {
  id: number;
  sequence_number: number;
  index?: number;
  document_type?: string;
  status: string;
  original_filename: string;
  fields: ExtractedField[];
  translated_fields?: ExtractedField[];
  error_message?: string | null;
  processing_completed_at?: string;
};


export interface ExtractionBatch {
  batch_id: number;
  status: string;
  document_type: string;  
  total_documents: number;
  processed_documents: number;
  documents: ExtractedDocument[];
  created_at?: string;
  completed_at?: string;
}

// invoice-specific data structure
export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface InvoiceData {
  invoice_number?: string;
  date?: string;
  due_date?: string;
  vendor_name?: string;
  vendor_address?: string;
  vendor_tax_id?: string;
  customer_name?: string;
  customer_address?: string;
  customer_tax_id?: string;
  line_items?: InvoiceLineItem[];
  subtotal?: number;
  tax?: number;
  total?: number;
  currency?: string;
  payment_terms?: string;
  notes?: string;
}

//passport-specific data structure

export interface PassportData {
  passport_number?: string;
  surname?: string;
  given_names?: string;
  nationality?: string;
  date_of_birth?: string;
  place_of_birth?: string;
  gender?: 'M' | 'F' | 'X';
  date_of_issue?: string;
  date_of_expiry?: string;
  issuing_authority?: string;
  issuing_country?: string;
  mrz_line1?: string;
  mrz_line2?: string;
  photo?: string; // base64 or path
  signature?: string; // base64 or path
}

//contract-specific data structure
export interface ContractData {
  contract_number?: string;
  contract_date?: string;
  effective_date?: string;
  expiration_date?: string;
  parties?: ContractParty[];
  title?: string;
  description?: string;
  jurisdiction?: string;
  governing_law?: string;
  total_value?: number;
  currency?: string;
  payment_terms?: string;
  renewal_terms?: string;
  termination_terms?: string;
  signatures?: ContractSignature[];
  clauses?: ContractClause[];
}

export interface ContractParty {
  name: string;
  role: string; // "buyer", "seller", "lessor", "lessee", etc.
  address?: string;
  contact_info?: string;
}

export interface ContractSignature {
  party_name: string;
  signatory_name?: string;
  date?: string;
  location?: string;
}

export interface ContractClause {
  title: string;
  content: string;
  page_number?: number;
}