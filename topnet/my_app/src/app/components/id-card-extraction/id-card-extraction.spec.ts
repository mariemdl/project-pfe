import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IdCardExtraction } from './id-card-extraction';

describe('IdCardExtraction', () => {
  let component: IdCardExtraction;
  let fixture: ComponentFixture<IdCardExtraction>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IdCardExtraction],
    }).compileComponents();

    fixture = TestBed.createComponent(IdCardExtraction);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
