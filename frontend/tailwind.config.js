/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],

  // Theme is driven by `data-theme` attribute on <html> (dark | light | slate).
  // We expose the same CSS-variable tokens from theme.css as Tailwind utilities
  // so components can use e.g. `bg-surface text-gold` and get the right colour
  // for whichever theme is active.
  theme: {
    extend: {
      colors: {
        // All map to the CSS variables defined in theme.css
        bg:        'var(--bg)',
        surface:   'var(--surface)',
        surface2:  'var(--surface2)',
        surface3:  'var(--surface3)',
        border:    'var(--border)',
        border2:   'var(--border2)',
        gold:      'var(--gold)',
        'gold-dim': 'var(--gold-dim)',
        text:      'var(--text)',
        'text-dim': 'var(--text-dim)',
        'text-muted': 'var(--text-muted)',
        danger:    'var(--red)',
      },
      fontFamily: {
        display: 'var(--fd)',  // Cinzel
        body:    'var(--fb)',  // Crimson Text
      },
      fontSize: {
        header: ['0.9rem', { letterSpacing: '0.08em' }],
        label:  ['0.65rem', { letterSpacing: '0.06em' }],
      },
      boxShadow: {
        header: '0 2px 12px rgba(0,0,0,0.5)',
        card:   '0 2px 8px rgba(0,0,0,0.4)',
      },
    },
  },

  plugins: [
    // writing-mode utility used by PdfViewer sidebar toggle
    function ({ addUtilities }) {
      addUtilities({
        '.writing-mode-vertical': { writingMode: 'vertical-rl' },
        '.writing-mode-horizontal': { writingMode: 'horizontal-tb' },
      });
    },
  ],
};
