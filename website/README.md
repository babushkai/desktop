# MLOps Desktop Website

Marketing website and documentation for MLOps Desktop, built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build).

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Structure

```
src/
├── assets/           # Images and icons
├── components/       # Astro components (landing page)
├── content/docs/     # Documentation (MDX)
│   ├── getting-started/
│   ├── tutorials/
│   ├── reference/
│   └── guides/
├── pages/           # Landing page, legal pages, API routes
└── styles/          # Custom CSS
```

## Theme

The website uses the same dark theme as the MLOps Desktop app. Colors are synced via CSS variables in `src/styles/custom.css`.

## Deployment

Deploy to Vercel:

1. Connect the repository to Vercel
2. Set root directory to `website`
3. Build command: `npm run build`
4. Output directory: `dist`
