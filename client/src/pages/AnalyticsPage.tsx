import { trpc } from "@/lib/trpc";
import { BarChart3, TrendingUp, Users, FileText, Shield, ShoppingBag, Briefcase, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

const COLORS = ["#f97316", "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

function StatCard({ title, value, icon, sub }: { title: string; value: string | number; icon: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { data: platformStats } = trpc.analytics.platformStats.useQuery();
  const { data: companyStats } = trpc.analytics.companyStats.useQuery();
  const { data: contractsOverview } = trpc.analytics.contractsOverview.useQuery();
  const { data: proOverview } = trpc.analytics.proServicesOverview.useQuery();
  const { data: crmPipeline } = trpc.analytics.dealsPipeline.useQuery();
  const { data: hrStats } = trpc.analytics.hrOverview.useQuery();

  const moduleData = [
    { name: "Sanad", value: companyStats?.sanadApplications ?? 0, color: "#3b82f6" },
    { name: "PRO Services", value: companyStats?.proServices ?? 0, color: "#8b5cf6" },
    { name: "Contracts", value: companyStats?.contracts ?? 0, color: "#f97316" },
    { name: "Marketplace", value: 0, color: "#10b981" },
    { name: "HR", value: companyStats?.employees ?? 0, color: "#f59e0b" },
    { name: "CRM", value: companyStats?.contacts ?? 0, color: "#ef4444" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 size={24} className="text-[var(--smartpro-orange)]" />
          Analytics Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Cross-module reporting and business intelligence</p>
      </div>

      {/* Platform Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Companies" value={platformStats?.companies ?? 0} icon={<Building2 size={18} />} />
        <StatCard title="Total Users" value={platformStats?.users ?? 0} icon={<Users size={18} />} />
        <StatCard title="Contracts" value={platformStats?.contracts ?? 0} icon={<FileText size={18} />} />
        <StatCard title="PRO Services" value={platformStats?.proServices ?? 0} icon={<Shield size={18} />} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Platform Overview</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="pro">PRO Services</TabsTrigger>
          <TabsTrigger value="crm">CRM Pipeline</TabsTrigger>
          <TabsTrigger value="hr">HR</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Module Activity Bar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Module Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={moduleData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {moduleData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Module Distribution Pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Activity Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={moduleData.filter((d) => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {moduleData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                {moduleData.every((d) => d.value === 0) && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">No data yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Sanad Applications" value={companyStats?.sanadApplications ?? 0} icon={<Building2 size={18} />} />
            <StatCard title="PRO Services" value={companyStats?.proServices ?? 0} icon={<Shield size={18} />} />
            <StatCard title="Employees" value={companyStats?.employees ?? 0} icon={<Briefcase size={18} />} />
            <StatCard title="CRM Contacts" value={companyStats?.contacts ?? 0} icon={<Users size={18} />} />
          </div>
        </TabsContent>

        <TabsContent value="contracts" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Contracts by Type</CardTitle>
              </CardHeader>
              <CardContent>
                {contractsOverview && Array.isArray(contractsOverview) && contractsOverview.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={contractsOverview} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No contract data yet
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Contracts by Status</CardTitle>
              </CardHeader>
              <CardContent>
                {contractsOverview && Array.isArray(contractsOverview) && contractsOverview.some((c) => c.count > 0) ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={contractsOverview.filter((c) => c.count > 0)} cx="50%" cy="50%" outerRadius={100} dataKey="count" nameKey="status"
                        label={({ status, count }: { status: string; count: number }) => `${status}: ${count}`}>
                        {contractsOverview.filter((c) => c.count > 0).map((_: unknown, index: number) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No contract data yet
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pro" className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">PRO Services by Status</CardTitle>
            </CardHeader>
            <CardContent>
                {proOverview && Array.isArray(proOverview) && proOverview.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={proOverview} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No PRO service data yet
                  </div>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crm" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {crmPipeline?.map((stage: any) => (
              <Card key={stage.stage}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground capitalize">{stage.stage?.replace(/_/g, " ")}</p>
                  <p className="text-2xl font-bold mt-1">{stage.count}</p>
                  <p className="text-xs text-muted-foreground">OMR {Number(stage.totalValue ?? 0).toLocaleString()}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {(!crmPipeline || crmPipeline.length === 0) && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center text-muted-foreground text-sm">
                No CRM pipeline data yet
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="hr" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Employees" value={hrStats?.totalEmployees ?? 0} icon={<Users size={18} />} />
            <StatCard title="Active" value={hrStats?.activeEmployees ?? 0} icon={<Users size={18} />} />
            <StatCard title="Open Positions" value={0} icon={<Briefcase size={18} />} />
            <StatCard title="Pending Leave" value={hrStats?.pendingLeave ?? 0} icon={<TrendingUp size={18} />} />
          </div>
          {hrStats?.byDepartment && hrStats.byDepartment.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Employees by Department</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={hrStats.byDepartment.map((d: { dept: string; count: number }) => ({ department: d.dept, count: d.count }))} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
