import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';  // Fixed path (../ → ../../)
import { DashboardStats, RecentActivity, DailyStat } from '../models/dashboard.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  stats: DashboardStats | null = null;
  loading = true;
  error: string | null = null;
  refreshInterval: any;

  // Document type icons and colors
  typeConfig: Record<string, { icon: string; color: string; label: string }> = {
    'id-card': { icon: '🆔', color: '#3b82f6', label: 'ID Card' },
    'invoice': { icon: '📄', color: '#10b981', label: 'Invoice' },
    'passport': { icon: '🛂', color: '#f59e0b', label: 'Passport' },
    'contract': { icon: '📝', color: '#8b5cf6', label: 'Contract' }
  };

  statusConfig: Record<string, { icon: string; color: string }> = {
    'completed': { icon: '✅', color: '#10b981' },
    'processing': { icon: '⏳', color: '#f59e0b' },
    'failed': { icon: '❌', color: '#ef4444' },
    'pending': { icon: '⏸️', color: '#6b7280' }
  };

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef){}

  ngOnInit() {
    console.log('🔵 DASHBOARD COMPONENT LOADED - this should only appear on /dashboard');
    this.loadDashboard();
    // Auto-refresh every 30 seconds
    this.refreshInterval = setInterval(() => this.loadDashboard(), 30000);
  }

  ngOnDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  loadDashboard() {
    this.loading =true;
    this.cdr.detectChanges();

    this.http.get<DashboardStats>(`${environment.apiUrl}/api/dashboard/stats`)
      .subscribe({
        next: (data) => {
          this.stats = data;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to load dashboard:', err);
          this.error = 'Failed to load dashboard data';
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
  }

  //get document type keys for iteration
  getDocumentTypeKeys(): string[] {
    if (!this.stats) return [];
    return Object.keys(this.stats.documents_by_type);
  }

  //get document count by type
  getDocumentCount(type: string): number {
    if (!this.stats) return 0;
    return this.stats.documents_by_type[type as keyof typeof this.stats.documents_by_type] || 0;
  }

  getDocumentTypeLabel(type: string): string {
    return this.typeConfig[type]?.label || type;
  }

  getDocumentTypeIcon(type: string): string {
    return this.typeConfig[type]?.icon || '📄';
  }

  getStatusIcon(status: string): string {
    return this.statusConfig[status]?.icon || '❓';
  }

  getStatusColor(status: string): string {
    return this.statusConfig[status]?.color || '#6b7280';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString();
  }

  formatTime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  getSuccessRateColor(rate: number): string {
    if (rate >= 90) return '#10b981';
    if (rate >= 70) return '#f59e0b';
    return '#ef4444';
  }

  //pie chart
  getTotalDocuments(): number {
    if (!this.stats) return 0;
    return Object.values(this.stats.documents_by_type).reduce((a, b) => a + b, 0);
  }

  getSegmentRotation(index: number): number {
    if (!this.stats) return 0;
    const keys = this.getDocumentTypeKeys();
    let rotation = 0;
    for (let i = 0; i < index; i++) {
      rotation += (this.getDocumentCount(keys[i]) / this.getTotalDocuments()) * 360;
    }
    return rotation;
  }

  getSegmentClipPath(index: number): string {
    if (!this.stats) return '';
    const keys = this.getDocumentTypeKeys();
    const percentage = this.getDocumentCount(keys[index]) / this.getTotalDocuments();
  
    if (percentage <= 0.5) {
      return 'polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 50% 100%)';
    } else {
      return 'polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, 50% 0%)';
    }
  }

  //bar chart
  getMaxCount(): number {
    if (!this.stats?.processing_trend) return 1;
    return Math.max(...this.stats.processing_trend.map(d => d.count), 1);
  }

  getBarHeight(count: number): number {
    return (count / this.getMaxCount()) * 100;
  }

  getSuccessPercentage(day: any): number {
    if (day.count === 0) return 0;
    return (day.success_count / day.count) * 100;
  }

  getBarColor(day: any): string {
    if (day.count === 0) return '#e5e7eb';
    const successRate = (day.success_count / day.count) * 100;
    if (successRate >= 90) return '#10b981'; // green
    if (successRate >= 70) return '#f59e0b'; // orange
    return '#ef4444'; // red
  }

  formatDayLabel(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }

}