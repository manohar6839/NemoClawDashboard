import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeProvider } from "@/components/theme-provider"
import { ModeToggle } from "@/components/mode-toggle"
import "./globals.css";
import { Agentation } from 'agentation';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Command Center",
  description: "Tarzan's Dashboard for Agent Management",
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
          <SidebarProvider>
            <TooltipProvider>
              <AppSidebar />
              <main className="w-full bg-background text-foreground relative">
                <div className="p-4 flex items-center justify-between border-b border-border bg-sidebar/50 backdrop-blur-sm sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <SidebarTrigger />
                    <h1 className="text-sm font-medium text-muted-foreground">Tarzan's Dashboard</h1>
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
        </ThemeProvider>
      </body>
    </html>
  );
}
