/** @type {import('tailwindcss').Config} */
export default {
  // 'class' disabilita l'auto-switch via prefers-color-scheme (default 'media').
  // Le classi `dark:*` sparse nei TSX si attivano SOLO se <html> ha class="dark",
  // che non viene mai aggiunta dopo la rimozione del ThemeProvider — risultato:
  // tema light fisso, niente cambio automatico al tramonto su macOS/iOS.
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Mappatura colori semantici → CSS variables (pattern shadcn/ui).
        // I componenti che usano bg-card/text-foreground/ecc. si adattano al tema.
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
          muted: 'hsl(var(--card-muted))',
        },
        sidebar: 'hsl(var(--sidebar))',
        // Stati preventivo + semantici (handoff): con <alpha-value> per
        // supportare i modificatori /alpha (es. bg-state-inviato/15).
        'state-bozza': 'hsl(var(--state-bozza) / <alpha-value>)',
        'state-revisione': 'hsl(var(--state-revisione) / <alpha-value>)',
        'state-inviato': 'hsl(var(--state-inviato) / <alpha-value>)',
        'state-letto': 'hsl(var(--state-letto) / <alpha-value>)',
        'state-attesa': 'hsl(var(--state-attesa) / <alpha-value>)',
        'state-confermato': 'hsl(var(--state-confermato) / <alpha-value>)',
        'state-completo': 'hsl(var(--state-completo) / <alpha-value>)',
        'state-perso': 'hsl(var(--state-perso) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        danger: 'hsl(var(--danger) / <alpha-value>)',
        info: 'hsl(var(--info) / <alpha-value>)',
        confirmed: 'hsl(var(--confirmed) / <alpha-value>)',
        tools: 'hsl(var(--tools) / <alpha-value>)',
        sales: 'hsl(var(--sales) / <alpha-value>)',
        customers: 'hsl(var(--customers) / <alpha-value>)',
        officina: 'hsl(var(--officina) / <alpha-value>)',
        edm: 'hsl(var(--edm) / <alpha-value>)',
        stats: 'hsl(var(--stats) / <alpha-value>)',
        'fam-acciaio': 'hsl(var(--fam-acciaio) / <alpha-value>)',
        'fam-inox': 'hsl(var(--fam-inox) / <alpha-value>)',
        'fam-legato': 'hsl(var(--fam-legato) / <alpha-value>)',
        'fam-alluminio': 'hsl(var(--fam-alluminio) / <alpha-value>)',
        'fam-ottone': 'hsl(var(--fam-ottone) / <alpha-value>)',
        'fam-rame': 'hsl(var(--fam-rame) / <alpha-value>)',
        'fam-bronzo': 'hsl(var(--fam-bronzo) / <alpha-value>)',
        'fam-plastica': 'hsl(var(--fam-plastica) / <alpha-value>)',
        'fam-altro': 'hsl(var(--fam-altro) / <alpha-value>)',
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
      },
    },
  },
  plugins: [],
}
