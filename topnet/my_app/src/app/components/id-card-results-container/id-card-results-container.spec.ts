import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IdCardResultsContainer } from './id-card-results-container';

describe('IdCardResultsContainer', () => {
  let component: IdCardResultsContainer;
  let fixture: ComponentFixture<IdCardResultsContainer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IdCardResultsContainer],
    }).compileComponents();

    fixture = TestBed.createComponent(IdCardResultsContainer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
