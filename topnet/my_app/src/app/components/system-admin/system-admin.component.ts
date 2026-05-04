import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

interface ServiceStatus {
  name: string;
  status: string;
  last_check: string;
  response_time_ms: number;
  error_count: number;
}

interface SystemHealth {
  status: string;
  timestamp: string;
  services: {
    backend: { status: string; error: string | null };
    database: { status: string; error: string | null };
    ai_service: { status: string; error: string | null };
    selenium: { status: string; error: string | null };
  };
  statistics: {
    active_users: number;
    total_users: number;
    error_rate_24h: number;
    total_requests_24h: number;
  };
}

interface SystemLog {
  id: number;
  timestamp: string;
  level: string;
  source: string;
  message: string;
  details: any;
}

interface AIStats {
  period_hours: number;
  total_calls: number;
  by_type: any[];
  mock_vs_real: { mock: number; real: number; mock_percentage: number };
}

interface DatabaseTable {
  table_name: string;
  display_name: string;
  row_count: number;
  size_mb: number;
  column_count: number;
  last_updated: string | null;
}

interface DatabaseTableDetail {
  table_name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    primary_key: boolean;
    default: string | null;
  }>;
  indexes: Array<{
    name: string;
    definition: string;
  }>;
  total_columns: number;
  total_indexes: number;
}

interface DatabaseStats {
  connection_status: string;
  active_connections: number;
  database_size_mb: number;
  database_size_gb: number;
  total_tables: number;
  cache_hit_ratio: number;
  transactions: {
    committed: number;
    rolled_back: number;
    total: number;
  };
  table_sizes: Array<{
    table_name: string;
    size_mb: number;
  }>;
  last_analyze: string | null;
  last_vacuum: string | null;
}

interface DatabaseConnection {
  pid: number;
  username: string;
  application: string;
  client_address: string;
  state: string;
  query_start: string | null;
  query_preview: string;
}

@Component({
  selector: 'app-system-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './system-admin.component.html',
  styleUrls: ['./system-admin.component.css']
})
export class SystemAdminComponent implements OnInit, OnDestroy {
  // Data
  services: ServiceStatus[] = [];
  systemHealth: SystemHealth | null = null;
  logs: SystemLog[] = [];
  errorLogs: any = null;
  aiStats: AIStats | null = null;
  
  // UI State
  activeTab: string = 'dashboard';
  loading = true;
  error = '';
  refreshInterval: any;
  autoRefresh = true;
  selectedLogLevel = '';
  selectedLogSource = '';
  logFilterHours = 24;

  // Database properties
  databaseTables: DatabaseTable[] = [];
  databaseTableDetails: DatabaseTableDetail | null = null;
  databaseStats: DatabaseStats | null = null;
  databaseConnections: DatabaseConnection[] = [];
  selectedTableForDetails: string = '';
  tablePreviewRows: any[] = [];
  tablePreviewColumns: string[] = [];
  showTablePreview: boolean = false;
  showTableDetails: boolean = false;
  dbQuery: string = '';
  dbQueryResult: any = null;
  dbQueryLoading: boolean = false;
  dbTablesLoading: boolean = false;
  dbStatsLoading: boolean = false;
  dbConnectionsLoading: boolean = false;
  dbSubTab: string = 'tables';
  
  private apiUrl = 'http://localhost:8000/api/system';

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadAllData();
    
    if (this.autoRefresh) {
      this.refreshInterval = setInterval(() => {
        this.refreshData();
      }, 30000);
    }
  }

  ngOnDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  loadAllData() {
    this.loading = true;
    Promise.all([
      this.loadSystemHealth(),
      this.loadServices(),
      this.loadLogs(),
      this.loadErrorLogs(),
      this.loadAIStats(),
      this.loadDatabaseTables(),
      this.loadDatabaseStats(),
      this.loadDatabaseConnections()
    ]).finally(() => {
      this.loading = false;
      this.cdr.detectChanges();
    });
  }

  refreshData() {
    if (!this.autoRefresh) return;
    this.loadSystemHealth();
    this.loadServices();
    this.loadAIStats();
    this.loadDatabaseStats();
    this.loadDatabaseConnections();
  }

  loadSystemHealth() {
    this.http.get<SystemHealth>(`${this.apiUrl}/health`).subscribe({
      next: (data) => {
        this.systemHealth = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error loading system health:', err)
    });
  }

  loadServices() {
    this.http.get<ServiceStatus[]>(`${this.apiUrl}/services`).subscribe({
      next: (data) => {
        this.services = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error loading services:', err)
    });
  }

  loadLogs() {
    let url = `${this.apiUrl}/logs?limit=50`;
    if (this.selectedLogLevel) url += `&level=${this.selectedLogLevel}`;
    if (this.selectedLogSource) url += `&source=${this.selectedLogSource}`;
    
    this.http.get<any>(url).subscribe({
      next: (data) => {
        this.logs = data.logs || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error loading logs:', err)
    });
  }

  loadErrorLogs() {
    this.http.get<any>(`${this.apiUrl}/logs/errors?hours=${this.logFilterHours}`).subscribe({
      next: (data) => {
        this.errorLogs = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error loading error logs:', err)
    });
  }

  loadAIStats() {
    this.http.get<AIStats>(`${this.apiUrl}/ai/stats?hours=24`).subscribe({
      next: (data) => {
        this.aiStats = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error loading AI stats:', err)
    });
  }

  loadDatabaseTables() {
    this.dbTablesLoading = true;
    this.http.get<DatabaseTable[]>(`${this.apiUrl}/database/tables`).subscribe({
      next: (data) => {
        this.databaseTables = data;
        this.dbTablesLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading database tables:', err);
        this.dbTablesLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // remplacer l'icône des tables
  getTableIconFromName(tableName: string): string {
    const icons: Record<string, string> = {
      'users': '👥',
      'batches': '📦',
      'documents': '📄',
      'extracted_fields': '🏷️',
      'translations': '🌐',
      'document_analysis': '🔍',
      'user_document_access': '🔐',
      'user_activity_log': '📝',
      'user_sessions': '🔑',
      'password_resets': '🔄',
      'system_logs': '📋',
      'ai_call_logs': '🤖',
      'service_status': '⚙️'
    };
    return icons[tableName] || '📊';
  }


  loadDatabaseStats() {
    this.dbStatsLoading = true;
    this.http.get<DatabaseStats>(`${this.apiUrl}/database/stats`).subscribe({
      next: (data) => {
        this.databaseStats = data;
        this.dbStatsLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading database stats:', err);
        this.dbStatsLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadDatabaseConnections() {
    this.dbConnectionsLoading = true;
    this.http.get<{active_connections: number, connections: DatabaseConnection[]}>(`${this.apiUrl}/database/connections`).subscribe({
      next: (data) => {
        this.databaseConnections = data.connections || [];
        this.dbConnectionsLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading connections:', err);
        this.dbConnectionsLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadTableDetails(tableName: string) {
    this.selectedTableForDetails = tableName;
    this.showTableDetails = true;
    this.showTablePreview = false;
    
    this.http.get<DatabaseTableDetail>(`${this.apiUrl}/database/tables/${tableName}/details`).subscribe({
      next: (data) => {
        this.databaseTableDetails = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading table details:', err);
      }
    });
  }

  loadTablePreview(tableName: string) {
    this.selectedTableForDetails = tableName;
    this.showTablePreview = true;
    this.showTableDetails = false;
    
    this.http.get(`${this.apiUrl}/database/tables/${tableName}/preview?limit=20`).subscribe({
      next: (data: any) => {
        this.tablePreviewRows = data.rows || [];
        this.tablePreviewColumns = data.columns || [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading table preview:', err);
      }
    });
  }

  executeDatabaseQuery() {
    if (!this.dbQuery.trim()) return;
    if (!this.dbQuery.trim().toUpperCase().startsWith('SELECT')) {
      alert('Only SELECT queries are allowed for safety.');
      return;
    }
    
    this.dbQueryLoading = true;
    this.dbQueryResult = null;
    
    this.http.get(`${this.apiUrl}/database/query`, {
      params: { sql_query: this.dbQuery }
    }).subscribe({
      next: (data: any) => {
        this.dbQueryResult = data;
        this.dbQueryLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Query error:', err);
        this.dbQueryResult = { error: err.error?.detail || 'Query execution failed' };
        this.dbQueryLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  refreshDatabaseData() {
    this.loadDatabaseTables();
    this.loadDatabaseStats();
    this.loadDatabaseConnections();
  }

  getSizeColor(sizeMb: number): string {
    if (sizeMb < 1) return '#10b981';
    if (sizeMb < 10) return '#f59e0b';
    return '#ef4444';
  }

  getStatusBadgeClass(status: string): string {
    switch(status) {
      case 'running': return 'badge-success';
      case 'degraded': return 'badge-warning';
      case 'down': return 'badge-danger';
      default: return 'badge-secondary';
    }
  }

  getLevelBadgeClass(level: string): string {
    switch(level) {
      case 'ERROR': return 'badge-danger';
      case 'CRITICAL': return 'badge-critical';
      case 'WARNING': return 'badge-warning';
      default: return 'badge-info';
    }
  }

  formatTimestamp(timestamp: string | null | undefined): string {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  toggleAutoRefresh() {
    if (this.autoRefresh && !this.refreshInterval) {
      this.refreshInterval = setInterval(() => this.refreshData(), 30000);
    } else if (!this.autoRefresh && this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  restartService(serviceName: string) {
    if (confirm(`Restart ${serviceName} service?`)) {
      this.http.post(`${this.apiUrl}/control/restart-service?service_name=${serviceName}`, {}).subscribe({
        next: (response) => {
          alert(`Service ${serviceName} restart initiated`);
          this.loadServices();
        },
        error: (err) => console.error('Error restarting service:', err)
      });
    }
  }

  toggleMockAI() {
    if (confirm('Toggle USE_MOCK_AI setting? This will require a backend restart to take effect.')) {
      this.http.post(`${this.apiUrl}/control/toggle-mock-ai`, {}).subscribe({
        next: (response: any) => {
          alert(response.message);
          this.loadAIStats();
        },
        error: (err) => console.error('Error toggling mock AI:', err)
      });
    }
  }

  applyLogFilters() {
    this.loadLogs();
  }

  resetLogFilters() {
    this.selectedLogLevel = '';
    this.selectedLogSource = '';
    this.loadLogs();
  }

  changeTab(tab: string) {
    this.activeTab = tab;
    if (tab === 'database') {
      this.refreshDatabaseData();
    }
    this.cdr.detectChanges();
  }
}