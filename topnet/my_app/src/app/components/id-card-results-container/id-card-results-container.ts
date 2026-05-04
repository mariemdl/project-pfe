import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ExtractionResultsComponent } from '../../shared/components/extraction-results/extraction-results';
import { ExtractionBatch } from '../../models/extraction.models';

@Component({
  selector: 'app-id-card-results-container',
  standalone: true,
  imports: [CommonModule, ExtractionResultsComponent],
  template: `
      <app-extraction-results></app-extraction-results>
  `
})
export class IdCardResultsContainerComponent implements OnInit {
  batch: ExtractionBatch | null = null;
  loading = true;
  error: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit() {
    const batchId = this.route.snapshot.paramMap.get('id');
    if (batchId) {
      this.loadResults(+batchId);
    } else {
      this.error = 'No batch ID provided';
      this.loading = false;
    }
  }

  loadResults(batchId: number) {
    this.http.get<ExtractionBatch>(`http://localhost:8000/api/batch/${batchId}`)
      .subscribe({
        next: (data) => {
          this.batch = data;
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading results:', err);
          this.error = 'Failed to load extraction results. Please try again.';
          this.loading = false;
        }
      });
  }

  onDownloadPdf(batchId: number) {
    window.open(`http://localhost:8000/api/batch/${batchId}/pdf`, '_blank');
  }

  onNewExtraction() {
    this.router.navigate(['/extraction/id-card']);
  }

  onRetry() {
    this.loading = true;
    this.error = null;
    if (this.batch) {
      this.loadResults(this.batch.batch_id);
    } else {
      this.onNewExtraction();
    }
  }
}