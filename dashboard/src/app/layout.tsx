import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeProvider } from "@/components/theme-provider"
import { ModeToggle } from "@/components/mode-toggle"
import "./globals.css";
import { Agentation } from 'agentation';
import { ChatProvider } from "@/contexts/chat-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tiger Command Center",
  description: "Tiger Agent Management Dashboard",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico",  sizes: "any" },
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <ChatProvider>
            <SidebarProvider>
            <TooltipProvider>
              <AppSidebar />
              <main className="w-full bg-background text-foreground relative">
                <div className="p-4 flex items-center justify-between border-b border-border bg-sidebar/50 backdrop-blur-sm sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <SidebarTrigger />
                    <div className="flex items-center gap-2">
                      {/* Tiger Command icon — same SVG as favicon */}
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="h-5 w-5 shrink-0" aria-hidden="true">
                        <defs>
                          <linearGradient id="hdr-tg" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#f97316"/>
                            <stop offset="100%" stopColor="#ea580c"/>
                          </linearGradient>
                        </defs>
                        <rect width="32" height="32" rx="6" fill="#1a1a2e"/>
                        <text x="16" y="23" fontFamily="Arial Black, sans-serif" fontSize="20" fontWeight="900" fill="url(#hdr-tg)" textAnchor="middle">T</text>
                        <rect x="4"  y="4"  width="5" height="3" rx="1" fill="#f97316" opacity="0.7"/>
                        <rect x="4"  y="9"  width="5" height="3" rx="1" fill="#f97316" opacity="0.5"/>
                        <rect x="4"  y="14" width="5" height="3" rx="1" fill="#f97316" opacity="0.3"/>
                        <rect x="23" y="4"  width="5" height="3" rx="1" fill="#f97316" opacity="0.7"/>
                        <rect x="23" y="9"  width="5" height="3" rx="1" fill="#f97316" opacity="0.5"/>
                        <rect x="23" y="14" width="5" height="3" rx="1" fill="#f97316" opacity="0.3"/>
                      </svg>
                      <span className="text-sm font-medium text-muted-foreground">Tiger Dashboard</span>
                    </div>
                  </div>
                  <ModeToggle />
                </div>
                <div className="p-6">
                  {children}
                </div>
                <Agentation />
              </main>
            </TooltipProvider>
            </SidebarProvider>
          </ChatProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
