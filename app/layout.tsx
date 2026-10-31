import "./globals.css";

export const metadata = {
  title: "SponsorDesk",
  description: "Sponsorship brokerage agents: prospect, pitch, negotiate, close. Humans only for exceptions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
