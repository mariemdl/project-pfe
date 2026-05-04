import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface LanguageResult {
  detectedLanguage: string;
  confidence: number;
}

export interface DownloadProgress {
  loaded: number;
  total: number;
  percentageComplete: number;
}

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private session: any = null;
  private modelAvailable = false;
  private downloadProgress = new BehaviorSubject<DownloadProgress | null>(null);
  
  downloadProgress$ = this.downloadProgress.asObservable();

  constructor() {}

  /**
   * Check if the Language Detector API is available in the browser
   */
  isAPIAvailable(): boolean {
    return typeof (window as any).LanguageDetector !== 'undefined';
  }

  /**
   * Check the availability status of the language detection model
   * Returns: 'unavailable', 'downloadable', 'downloading', or 'available'
   */
  async checkAvailability(): Promise<string> {
    if (!this.isAPIAvailable()) {
      return 'unavailable';
    }

    try {
      const LanguageDetector = (window as any).LanguageDetector;
      const availability = await LanguageDetector.availability();
      return availability;
    } catch (error) {
      console.error('Error checking availability:', error);
      return 'unavailable';
    }
  }

  /**
   * Initialize the language detector session
   * @param expectedLanguages - Array of BCP 47 language codes (e.g., ['en', 'fr', 'ar'])
   */
  async initialize(expectedLanguages: string[] = ['en', 'fr', 'ar', 'es', 'de']): Promise<boolean> {
    if (!this.isAPIAvailable()) {
      console.error('Language Detector API not available');
      return false;
    }

    try {
      const LanguageDetector = (window as any).LanguageDetector;
      
      // Create session with progress monitoring
      this.session = await LanguageDetector.create({
        expectedInputLanguages: expectedLanguages,
        monitor: (monitor: any) => {
          monitor.addEventListener('downloadprogress', (event: any) => {
            const percentage = (event.loaded / event.total) * 100;
            this.downloadProgress.next({
              loaded: event.loaded,
              total: event.total,
              percentageComplete: percentage
            });
            
            if (event.loaded === event.total) {
              this.modelAvailable = true;
              console.log('Language detection model fully downloaded');
            }
          });
        }
      });
      
      this.modelAvailable = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize language detector:', error);
      return false;
    }
  }

  /**
   * Detect the language of the given text
   * @param text - The text to analyze
   * @returns Array of language results sorted by confidence (highest first)
   */
  async detectLanguage(text: string): Promise<LanguageResult[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    if (!this.modelAvailable || !this.session) {
      console.warn('Language detector not initialized. Call initialize() first.');
      
      // Try to initialize on the fly
      const initialized = await this.initialize();
      if (!initialized) {
        return [];
      }
    }

    try {
      const results = await this.session.detect(text);
      return results.map((result: any) => ({
        detectedLanguage: result.detectedLanguage, // BCP 47 tag: 'en', 'fr', 'ar', etc.
        confidence: result.confidence // Number between 0 and 1
      }));
    } catch (error) {
      console.error('Language detection failed:', error);
      return [];
    }
  }

  /**
   * Get the primary (most likely) language of the text
   * @param text - The text to analyze
   * @returns The most likely language and its confidence
   */
  async getPrimaryLanguage(text: string): Promise<{ language: string; confidence: number; languageCode: string }> {
    const results = await this.detectLanguage(text);
    
    if (results.length === 0) {
      return { language: 'unknown', confidence: 0, languageCode: 'und' };
    }
    
    const primary = results[0];
    
    // Map BCP 47 codes to readable language names
    const languageMap: { [key: string]: string } = {
      'en': 'English',
      'fr': 'French',
      'ar': 'Arabic',
      'es': 'Spanish',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'nl': 'Dutch',
      'pl': 'Polish',
      'tr': 'Turkish',
      'sv': 'Swedish',
      'und': 'Undetermined'
    };
    
    return {
      language: languageMap[primary.detectedLanguage] || primary.detectedLanguage,
      confidence: primary.confidence,
      languageCode: primary.detectedLanguage
    };
  }

  /**
   * Check if the model is ready to use
   */
  isReady(): boolean {
    return this.modelAvailable && this.session !== null;
  }

  /**
   * Destroy the session to free resources
   */
  destroy(): void {
    if (this.session && this.session.destroy) {
      this.session.destroy();
      this.session = null;
      this.modelAvailable = false;
    }
  }
}