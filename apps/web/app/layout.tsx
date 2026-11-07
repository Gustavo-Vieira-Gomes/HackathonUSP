import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hackathon USP',
  description: 'Base inicial para construir e validar o produto do hackathon.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
