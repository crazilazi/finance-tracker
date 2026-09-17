import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * Flat config for ESLint 9. `next lint` was removed in Next.js 16, so
 * `npm run lint` invokes eslint directly with the Next.js rule set.
 *
 * The React Compiler heuristics shipped in eslint-config-next 16 flag several
 * long-standing, working patterns in this codebase (form state seeded from
 * props inside effects, a handlers ref refreshed during render). They are
 * kept visible as warnings so they can be cleaned up incrementally without
 * failing CI.
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/sw.js', 'public/workbox-*.js', 'scripts/**'],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
];

export default config;
