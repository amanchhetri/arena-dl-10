// Importing the i18n module triggers i18next.init() with the en bundle.
import { t } from '../index';

describe('i18n', () => {
  it('returns the English string for app.name', () => {
    expect(t('app.name')).toBe('Challenge Arena');
  });

  it('returns the key itself if missing', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });
});
