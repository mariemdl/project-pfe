import { Injectable } from '@angular/core';
import { WelcomeEmailComponent } from '../email-templates/welcome-email/welcome-email.component';

@Injectable({ providedIn: 'root' })
export class EmailTemplateService {
  
  generateWelcomeEmail(params: {
    username: string;
    password: string;
    fullName?: string;
    loginUrl?: string;
  }): string {
    // In a real app, you would render the component to HTML
    // For now, return a simple template
    const displayName = params.fullName || params.username;
    const loginUrl = params.loginUrl || 'http://localhost:4200/login';
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Welcome Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="background: #1e90ff; color: white; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0;">Welcome to Document Extraction Platform</h1>
    </div>
    <div style="padding: 30px 20px;">
      <p>Hello <strong>${displayName}</strong>,</p>
      <p>Your account has been created successfully. Here are your login credentials:</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Username:</strong> ${params.username}</p>
        <p><strong>Password:</strong> ${params.password}</p>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${loginUrl}" style="display: inline-block; padding: 12px 30px; background: #1e90ff; color: white; text-decoration: none; border-radius: 5px;">Login to Platform</a>
      </div>
      <div style="background: #fff3e0; padding: 15px; border-left: 4px solid #ffa502;">
        <p><strong>🔒 Important:</strong> Please change your password after first login.</p>
      </div>
    </div>
    <div style="background: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #666;">
      <p>This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>
    `;
  }
}