export interface DashboardStats {
  total_batches: number;
  total_documents: number;
  success_rate: number;
  avg_processing_time: number;
  documents_by_type: {
    'id-card': number;
    'invoice': number;
    'passport': number;
    'contract': number;
  };
  recent_activity: RecentActivity[];
  processing_trend: DailyStat[];
}

export interface RecentActivity {
  batch_id: number;
  document_type: string;
  status: string;
  created_at: string;
  documents: number;
}

export interface DailyStat {
  date: string;
  count: number;
  success_count: number;
  avg_time: number;
}

export interface BatchSummary {
  batch_id: number;
  document_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  total_documents: number;
  processed_documents: number;
  processing_time: number | null;
}

export interface BatchDetails {
  batch: {
    batch_id: number;
    document_type: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    total_documents: number;
    processed_documents: number;
  };
  documents: Array<{
    id: number;
    sequence_number: number;
    status: string;
    error_message: string | null;
  }>;
}