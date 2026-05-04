// DEBUG: Monitor localStorage writes and storage events
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key: string, value: string): void {
  console.trace('🔵 localStorage.setItem called:', key, value);
  originalSetItem.call(this, key, value);   // ✅ use call with explicit arguments
};

window.addEventListener('storage', (event) => {
  console.log('🔵 STORAGE EVENT:', event.key, 'old:', event.oldValue, 'new:', event.newValue);
});

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));