import hy from './hy.json';
import ru from './ru.json';
import en from './en.json';
import { Language } from '@amragrir/shared';

export const dictionaries = {
  [Language.Hy]: hy,
  [Language.Ru]: ru,
  [Language.En]: en,
} as const;
