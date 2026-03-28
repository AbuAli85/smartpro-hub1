import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Shield,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function StatCard({
  title,
  value,
  icon,
  gradient,
  change,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  gradient: string;
  change?: string;
}) {
  return (
    <div className={`${gradient} rounded-xl p-5 text-white shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white/70 text-xs font-medium uppercase tracking-wide">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {change && (
            <p className="text-white/70 text-xs mt-1 flex items-center gap-1">
              <TrendingUp size={10} /> {change}
            </p>
          )}
        </div>
        <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">{icon}</div>
      </div>
    </div>
  );
}

function QuickActionCard({
  title,
  description,
  href,
  icon,
  count,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  count?: number;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-[var(--smartpro-orange)] group-hover:text-white transition-colors shrink-0">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{title}</h3>
                {count !== undefined && count > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    {count}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
            </div>
            <ArrowRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0 mt-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading } = trpc.companies.myStats.useQuery();
  const { data: myCompany } = trpc.companies.myCompany.useQuery();
  const { data: expiringDocs } = trpc.pro.expiringDocuments.useQuery({ daysAhead: 30 });
  const { data: platformStats } = trpc.analytics.platformStats.useQuery();

  const isAdmin = user?.role === "admin";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
            {user?.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {myCompany ? `${myCompany.company.name} · ` : ""}
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        {expiringDocs && expiringDocs.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={16} className="text-amber-600" />
            <span className="text-xs text-amber-700 font-medium">
              {expiringDocs.length} document{expiringDocs.length > 1 ? "s" : ""} expiring soon
            </span>
          </div>
        )}
      </div>

      {/* Admin Platform Stats */}
      {isAdmin && platformStats && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Platform Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Companies"
              value={platformStats.companies}
              icon={<Building2 size={20} />}
              gradient="stat-gradient-1"
            />
            <StatCard
              title="Total Users"
              value={platformStats.users}
              icon={<Users size={20} />}
              gradient="stat-gradient-2"
            />
            <StatCard
              title="Contracts"
              value={platformStats.contracts}
              icon={<FileText size={20} />}
              gradient="stat-gradient-3"
            />
            <StatCard
              title="PRO Services"
              value={platformStats.proServices}
              icon={<Shield size={20} />}
              gradient="stat-gradient-4"
            />
          </div>
        </div>
      )}

      {/* Company Stats */}
      {!isAdmin && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Your Company Overview
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Employees"
                value={stats.employees}
                icon={<Users size={20} />}
                gradient="stat-gradient-1"
              />
              <StatCard
                title="Contracts"
                value={stats.contracts}
                icon={<FileText size={20} />}
                gradient="stat-gradient-2"
              />
              <StatCard
                title="PRO Services"
                value={stats.proServices}
                icon={<Shield size={20} />}
                gradient="stat-gradient-3"
              />
              <StatCard
                title="CRM Contacts"
                value={stats.contacts}
                icon={<Users size={20} />}
                gradient="stat-gradient-4"
              />
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Building2 size={32} className="mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">No company linked</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create or join a company to access all features.
                </p>
                <Button asChild size="sm">
                  <Link href="/admin">Set up company</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Quick Access
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickActionCard
            title="Sanad Offices"
            description="Manage government service offices"
            href="/sanad"
            icon={<Building2 size={18} />}
            count={stats?.sanadApplications}
          />
          <QuickActionCard
            title="PRO Services"
            description="Visa, work permits & labor cards"
            href="/pro"
            icon={<Shield size={18} />}
            count={stats?.proServices}
          />
          <QuickActionCard
            title="Contracts"
            description="Manage and sign contracts"
            href="/contracts"
            icon={<FileText size={18} />}
            count={stats?.contracts}
          />
          <QuickActionCard
            title="Marketplace"
            description="Find and book service providers"
            href="/marketplace"
            icon={<ShoppingBag size={18} />}
          />
          <QuickActionCard
            title="HR Module"
            description="Employees, leave & payroll"
            href="/hr/employees"
            icon={<Briefcase size={18} />}
            count={stats?.pendingLeave}
          />
          <QuickActionCard
            title="CRM"
            description="Contacts, deals & pipeline"
            href="/crm"
            icon={<Users size={18} />}
            count={stats?.deals}
          />
        </div>
      </div>

      {/* Expiring Documents Alert */}
      {expiringDocs && expiringDocs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Expiring Documents
          </h2>
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-4">
              <div className="space-y-2">
                {expiringDocs.slice(0, 5).map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between py-1.5 border-b border-amber-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                      <div>
                        <span className="text-sm font-medium">{doc.employeeName}</span>
                        <span className="text-xs text-muted-foreground ml-2">{doc.serviceType?.replace(/_/g, " ")}</span>
                      </div>
                    </div>
                    <span className="text-xs text-amber-700 font-medium">
                      Expires {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "N/A"}
                    </span>
                  </div>
                ))}
              </div>
              {expiringDocs.length > 5 && (
                <Button asChild variant="ghost" size="sm" className="mt-2 w-full text-amber-700">
                  <Link href="/pro">View all {expiringDocs.length} expiring documents</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Activity placeholder */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Recent Activity
          </h2>
          <Link href="/analytics">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              View all <ArrowUpRight size={12} />
            </Button>
          </Link>
        </div>
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              {[
                { icon: <CheckCircle2 size={14} className="text-green-600" />, text: "Platform initialized successfully", time: "Just now" },
                { icon: <Building2 size={14} className="text-blue-600" />, text: "SmartPRO Business Hub is ready", time: "Today" },
                { icon: <Shield size={14} className="text-purple-600" />, text: "All modules are active", time: "Today" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                    {item.icon}
                  </div>
                  <span className="text-sm flex-1">{item.text}</span>
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
