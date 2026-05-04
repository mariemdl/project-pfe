import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';

export interface TranslateResponse {
  translated_text: string;
  source_language: string;
  target_language: string;
}

@Injectable({ providedIn: 'root' })
export class TranslationService {
  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  async translateText(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string> {
    if (!text || text.trim().length === 0 || targetLanguage === 'none') {
      return text;
    }

    try {
      const response = await firstValueFrom(
        this.http.post<TranslateResponse>(
          `${environment.apiUrl}/api/translate`,
          {
            text: text,
            target_language: targetLanguage,
            source_language: sourceLanguage
          },
          { headers: { 'Authorization': `Bearer ${this.authService.getToken()}` } }
        )
      );
      return response.translated_text;
    } catch (error) {
      console.error('Translation failed:', error);
      return text;
    }
  }

  async translateFields(fields: any[], targetLanguage: string, sourceLanguage?: string): Promise<any[]> {
    if (!targetLanguage || targetLanguage === 'none') {
      return fields;
    }

    const translatedFields = [];
    for (const field of fields) {
      const translatedValue = await this.translateText(field.value, targetLanguage, sourceLanguage);
      translatedFields.push({
        name: field.name,
        value: translatedValue,
        original_value: field.value,
        translated_value: translatedValue,
        translation_language: targetLanguage,
        confidence: field.confidence
      });
    }
    return translatedFields;
  }
}