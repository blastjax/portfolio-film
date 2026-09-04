import './globals.css';

export const metadata = {
  title: 'Film Portfolio',
  description: 'A self-hosted photo portfolio.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
