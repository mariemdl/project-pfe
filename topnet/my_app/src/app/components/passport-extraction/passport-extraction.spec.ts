import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PassportExtraction } from './passport-extraction';

describe('PassportExtraction', () => {
  let component: PassportExtraction;
  let fixture: ComponentFixture<PassportExtraction>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PassportExtraction],
    }).compileComponents();

    fixture = TestBed.createComponent(PassportExtraction);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
