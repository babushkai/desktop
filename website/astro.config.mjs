import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://mlopsdesktop.com',
  integrations: [
    starlight({
      title: 'MLOps Desktop',
      description: 'Build, train, and deploy ML models with drag-and-drop. No cloud required.',
      logo: {
        src: './src/assets/logo.svg',
        replacesTitle: false,
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/babushkai/desktop' },
      ],
      // Internationalization
      defaultLocale: 'root',
      locales: {
        root: {
          label: 'English',
          lang: 'en',
        },
        ja: {
          label: '日本語',
          lang: 'ja',
        },
      },
      sidebar: [
        {
          label: 'Getting Started',
          translations: { ja: 'はじめに' },
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Tutorials',
          translations: { ja: 'チュートリアル' },
          autogenerate: { directory: 'tutorials' },
        },
        {
          label: 'Reference',
          translations: { ja: 'リファレンス' },
          autogenerate: { directory: 'reference' },
        },
        {
          label: 'Guides',
          translations: { ja: 'ガイド' },
          autogenerate: { directory: 'guides' },
        },
      ],
      customCss: ['./src/styles/custom.css'],
      head: [
        {
          tag: 'meta',
          attrs: {
            name: 'theme-color',
            content: '#0b0e14',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: '/og-image.png',
          },
        },
      ],
    }),
    tailwind({ applyBaseStyles: false }),
  ],
});
