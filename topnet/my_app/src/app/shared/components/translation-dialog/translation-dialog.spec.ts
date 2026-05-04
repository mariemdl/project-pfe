import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationDialog } from './translation-dialog';

describe('TranslationDialog', () => {
  let component: TranslationDialog;
  let fixture: ComponentFixture<TranslationDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslationDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
