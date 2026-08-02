import { TestBed } from '@angular/core/testing';

import { App } from './app';
import { appConfig } from './app.config';

/**
 * Tests du shell racine.
 * On réutilise la configuration réelle de l'app (appConfig) pour que
 * Transloco (loader statique) et le router soient présents comme en prod.
 */
describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [...appConfig.providers],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the wordmark', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('header')?.textContent).toContain('M0V13S');
  });
});
