import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Core tokens - resolved from CSS custom properties */
        'noc-bg':        'var(--noc-bg)',
        'noc-surface':   'var(--noc-surface)',
        'noc-border':    'var(--noc-border)',
        'noc-accent':    'var(--noc-accent)',
        'noc-text':      'var(--noc-text)',
        'noc-muted':     'var(--noc-muted)',
        'noc-success':   'var(--noc-success)',
        'noc-error':     'var(--noc-error)',
        'noc-warning':   'var(--noc-warning)',
        'noc-terminal':  'var(--noc-terminal)',

        /* Pre-composed opacity variants */
        'noc-accent-10':  'var(--noc-accent-10)',
        'noc-accent-20':  'var(--noc-accent-20)',
        'noc-accent-30':  'var(--noc-accent-30)',
        'noc-accent-40':  'var(--noc-accent-40)',
        'noc-error-10':   'var(--noc-error-10)',
        'noc-error-30':   'var(--noc-error-30)',
        'noc-warning-10': 'var(--noc-warning-10)',
        'noc-warning-20': 'var(--noc-warning-20)',
        'noc-success-10': 'var(--noc-success-10)',
        'noc-success-20': 'var(--noc-success-20)',
        'noc-bg-50':      'var(--noc-bg-50)',
        'noc-border-30':  'var(--noc-border-30)',
        'noc-border-50':  'var(--noc-border-50)',
        'noc-muted-10':   'var(--noc-muted-10)',
      },
    },
  },
  plugins: [],
};

export default config;
