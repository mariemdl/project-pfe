import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InvoiceExtraction } from './invoice-extraction';

describe('InvoiceExtraction', () => {
  let component: InvoiceExtraction;
  let fixture: ComponentFixture<InvoiceExtraction>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvoiceExtraction],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceExtraction);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
