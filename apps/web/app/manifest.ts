import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Vagas de exames — Hackathon USP',
    short_name: 'Vagas de exames',
    description: 'Encontre vagas de exames e receba alertas.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#075985',
    lang: 'pt-BR',
    icons: [192, 512].map((size) => ({
      src: `/icons/icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any',
    })),
  };
}
