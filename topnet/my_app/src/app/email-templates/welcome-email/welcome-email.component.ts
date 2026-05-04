import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-welcome-email',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './welcome-email.component.html',
  styleUrls: ['./welcome-email.component.css']
})
export class WelcomeEmailComponent {
  @Input() username: string = '';
  @Input() email: string = '';
  @Input() password: string = '';
  @Input() fullName: string = '';
  @Input() loginUrl: string = 'http://localhost:4200/login';
  
  get displayName(): string {
    return this.fullName || this.username;
  }
}