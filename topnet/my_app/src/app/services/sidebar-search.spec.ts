import { TestBed } from '@angular/core/testing';

import { SidebarSearch } from './sidebar-search';

describe('SidebarSearch', () => {
  let service: SidebarSearch;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SidebarSearch);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
