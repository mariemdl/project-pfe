import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Location } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-back-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button class="back-button" (click)="goBack()" title="Go back">
      <span class="back-arrow">↩️</span>
      <span class="back-text">Back</span>
    </button>
  `,
  styles: [`
    .back-button {
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--primary-color, #1E3A8A);
      color: white;
      border: none;
      border-radius: 30px;
      padding: 8px 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 500;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
      transition: all 0.2s ease;
      z-index: 1000;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .back-button:hover {
      background: var(--primary-dark, #1e2a5a);
      transform: translateX(-2px);
      box-shadow: 0 6px 15px rgba(0, 0, 0, 0.15);
    }

    .back-arrow {
      font-size: 1.2rem;
    }

    .back-text {
      @media (max-width: 480px) {
        display: none;
      }
    }

    /* Dark mode adjustment */
    body.dark .back-button {
      background: var(--primary-dark, #2d3748);
    }

    body.dark .back-button:hover {
      background: #4a5568;
    }
  `]
})
export class BackButtonComponent {
  constructor(
    private location: Location,
    private router: Router
  ) {}

  goBack() {
    // Check if there's a previous state in browser history
    if (window.history.length > 1) {
      this.location.back();
    } else {
      // Fallback to home if no history
      this.router.navigate(['/home']);
    }
  }
}