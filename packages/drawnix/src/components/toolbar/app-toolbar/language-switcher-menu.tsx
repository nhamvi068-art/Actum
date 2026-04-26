import { MenuIcon } from '../../icons';
import { useI18n } from '../../../i18n';
import Menu from '../../menu/menu';
import MenuItem from '../../menu/menu-item';

export const LanguageSwitcherMenu = () => {
  const { language, setLanguage, t } = useI18n();

  return (
    <MenuItem
      icon={MenuIcon}
      data-testid="language-switcher-button"
      onSelect={() => {}}
      submenu={
        <Menu onSelect={() => {}}>
          <MenuItem
            onSelect={() => {
              setLanguage('zh');
            }}
            aria-label={t('language.chinese')}
            selected={language === 'zh'}
          >
            {t('language.chinese')}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setLanguage('en');
            }}
            aria-label={t('language.english')}
            selected={language === 'en'}
          >
            {t('language.english')}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setLanguage('ru');
            }}
            aria-label={t('language.russian')}
            selected={language === 'ru'}
          >
            {t('language.russian')}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setLanguage('ar');
            }}
            aria-label={t('language.arabic')}
            selected={language === 'ar'}
          >
            {t('language.arabic')}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setLanguage('vi');
            }}
            aria-label={t('language.vietnamese')}
            selected={language === 'vi'}
          >
            {t('language.vietnamese')}
          </MenuItem>
        </Menu>
      }
      aria-label={t('language.switcher')}
    >
      {t('language.switcher')}
    </MenuItem>
  );
};

LanguageSwitcherMenu.displayName = 'LanguageSwitcherMenu';
