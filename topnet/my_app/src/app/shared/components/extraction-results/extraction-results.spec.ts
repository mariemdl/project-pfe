import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExtractionResultsComponent } from './extraction-results';

describe('ExtractionResults', () => {
  let component: ExtractionResultsComponent;
  let fixture: ComponentFixture<ExtractionResultsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExtractionResultsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ExtractionResultsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});