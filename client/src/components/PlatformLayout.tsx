import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Shield,
  ShoppingBag,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  children?: NavItem[];
}

const navGroups = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={18} /> },
      { label: "Analytics", href: "/analytics", icon: <BarChart3 size={18} /> },
    ],
  },
  {
    label: "Government Services",
    items: [
      { label: "Sanad Offices", href: "/sanad", icon: <Building2 size={18} /> },
      { label: "PRO Services", href: "/pro", icon: <Shield size={18} /> },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Contracts", href: "/contracts", icon: <FileText size={18} /> },
      { label: "Marketplace", href: "/marketplace", icon: <ShoppingBag size={18} /> },
      { label: "CRM", href: "/crm", icon: <Users size={18} /> },
    ],
  },
  {
    label: "Human Resources",
    items: [
      { label: "Employees", href: "/hr/employees", icon: <Briefcase size={18} /> },
      { label: "Recruitment", href: "/hr/recruitment", icon: <BookOpen size={18} /> },
      { label: "Leave & Payroll", href: "/hr/leave", icon: <Globe size={18} /> },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Subscriptions", href: "/subscriptions", icon: <Zap size={18} /> },
      { label: "Admin Panel", href: "/admin", icon: <Settings size={18} /> },
    ],
  },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { data: myCompany } = trpc.companies.myCompany.useQuery();

  return (
    <div className="flex flex-col h-full sidebar-nav">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-[var(--sidebar-border)]">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--smartpro-orange)] flex items-center justify-center">
            <span className="text-white font-bold text-sm">SP</span>
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-none">SmartPRO</div>
            <div className="text-[10px] text-white/50 leading-none mt-0.5">Business Hub</div>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="text-white/50 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Company badge */}
      {myCompany && (
        <div className="px-4 py-3 border-b border-[var(--sidebar-border)]">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/5">
            <Building2 size={14} className="text-white/60" />
            <span className="text-xs text-white/70 truncate">{myCompany.company.name}</span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location === item.href || location.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`sidebar-nav-item ${isActive ? "active" : ""}`}
                  >
                    {item.icon}
                    <span className="flex-1">{item.label}</span>
                    {isActive && <ChevronRight size={14} className="opacity-60" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-[var(--sidebar-border)]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              <Avatar className="w-7 h-7">
                <AvatarFallback className="bg-[var(--smartpro-orange)] text-white text-xs font-semibold">
                  {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <div className="text-xs font-medium text-white/90 truncate">{user?.name ?? "User"}</div>
                <div className="text-[10px] text-white/40 truncate">{user?.email ?? ""}</div>
              </div>
              <ChevronDown size={14} className="text-white/40 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings size={14} className="mr-2" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600">
              <LogOut size={14} className="mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // notifications placeholder

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--smartpro-orange)] flex items-center justify-center animate-pulse">
            <span className="text-white font-bold">SP</span>
          </div>
          <p className="text-sm text-muted-foreground">Loading SmartPRO...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-6 max-w-sm px-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--smartpro-orange)] flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-2xl">SP</span>
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">SmartPRO Hub</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              End-to-end business services platform for GCC enterprises
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            {["Sanad Offices", "PRO Services", "Contracts", "HR & CRM"].map((f) => (
              <div key={f} className="flex items-center gap-1.5 bg-muted rounded-md px-3 py-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--smartpro-orange)]" />
                {f}
              </div>
            ))}
          </div>
          <Button asChild className="w-full" size="lg">
            <a href={getLoginUrl()}>Sign in to SmartPRO</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col h-full">
        <SidebarContent />
      </aside>

      {/* Sidebar - mobile */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 z-50 lg:hidden transform transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="relative">
            <Bell size={18} />
          </Button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
