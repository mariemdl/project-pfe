import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContractExtractionComponent } from './contract-extraction';

describe('ContractExtractionComponent', () => {
  let component: ContractExtractionComponent;
  let fixture: ComponentFixture<ContractExtractionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContractExtractionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ContractExtractionComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
