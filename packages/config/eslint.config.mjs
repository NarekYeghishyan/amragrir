// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Base flat-config rules shared by every app/package. Each app extends this and adds its own framework plugin (Next.js, React Native, NestJS). */
export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        // `const { drop, ...keep } = obj` is the idiomatic way to omit keys;
        // the omitted bindings are intentionally unused.
        ignoreRestSiblings: true,
      },
    ],
  },
});
