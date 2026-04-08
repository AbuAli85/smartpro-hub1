import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import {
  DollarSign, TrendingUp, TrendingDown, AlertCircle, CheckCircle2,
  Clock, XCircle, Plus, RefreshCw, Wallet, Users, FileText, ChevronRight
} from "lucide-react";
import { DateInput } from "@/components/ui/date-input";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CAT_COLORS: Record<string, string> = {
  travel: "#3b82f6", meals: "#f59e0b", accommodation: "#8b5cf6",
  equipment: "#10b981", communication: "#06b6d4", training: "#f97316",
  medical: "#ef4444", other: "#6b7280",
};
const STATUS_COLORS = { pending: "bg-yellow-100 text-yellow-800", approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800", cancelled: "bg-gray-100 text-gray-700" };

function fmt(n: number) { return n.toLocaleString("en-GB", { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }

export default function FinanceOverviewPage() {
  const { activeCompanyId } = useActiveCompany();
  const [year, setYear] = useState(new Date().getFullYear());
  const [tab, setTab] = useState("overview");
  const [expenseFilter, setExpenseFilter] = useState("all");
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState<{ id: number; amount: string; desc: string } | null>(null);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [reviewNotes, setReviewNotes] = useState("");

  // Expense submit form state
  const [form, setForm] = useState({ expenseDate: new Date().toISOString().split("T")[0], category: "other", amount: "", currency: "OMR", description: "" });

  const { data: overview, refetch: refetchOverview } = trpc.financeHR.financeOverview.useQuery(
    { companyId: activeCompanyId ?? undefined, year },
    { enabled: activeCompanyId != null }
  );
  const { data: expenses, refetch: refetchExpenses } = trpc.financeHR.adminListExpenses.useQuery(
    { companyId: activeCompanyId ?? undefined, status: expenseFilter === "all" ? undefined : expenseFilter },
    { enabled: activeCompanyId != null }
  );
  const { data: expenseSummary } = trpc.financeHR.expenseSummary.useQuery(
    { companyId: activeCompanyId ?? undefined, year },
    { enabled: activeCompanyId != null }
  );

  const submitExpense = trpc.financeHR.submitExpense.useMutation({
    onSuccess: () => { toast.success("Expense claim submitted"); setShowSubmitDialog(false); setForm({ expenseDate: new Date().toISOString().split("T")[0], category: "other", amount: "", currency: "OMR", description: "" }); refetchExpenses(); refetchOverview(); },
    onError: (e) => toast.error(e.message),
  });
  const reviewExpense = trpc.financeHR.reviewExpense.useMutation({
    onSuccess: () => { toast.success(`Expense ${reviewAction}`); setShowReviewDialog(null); setReviewNotes(""); refetchExpenses(); refetchOverview(); },
    onError: (e) => toast.error(e.message),
  });

  const chartData = (overview?.monthlyData ?? []).map(m => ({
    name: MONTHS[m.month - 1],
    Payroll: parseFloat(m.payrollCost.toFixed(3)),
    Expenses: parseFloat(m.expenseCost.toFixed(3)),
  }));

  const pieData = (expenseSummary?.byCategory ?? []).map(c => ({
    name: c.category.charAt(0).toUpperCase() + c.category.slice(1),
    value: parseFloat(c.amount.toFixed(3)),
    color: CAT_COLORS[c.category] ?? "#6b7280",
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Finance Overview</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Payroll costs, expense claims, and financial summary</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { refetchOverview(); refetchExpenses(); }}>
            <RefreshCw size={14} className="mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowSubmitDialog(true)}>
            <Plus size={14} className="mr-1" /> Submit Expense
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Payroll Cost", value: `OMR ${fmt(overview?.totalPayroll ?? 0)}`, icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
          { label: "Approved Expenses", value: `OMR ${fmt(expenseSummary?.approved ?? 0)}`, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20" },
          { label: "Pending Expenses", value: `OMR ${fmt(overview?.pendingExpenseTotal ?? 0)}`, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/20", sub: `${overview?.pendingExpenseCount ?? 0} claims` },
          { label: "Total Cost (YTD)", value: `OMR ${fmt(overview?.totalCost ?? 0)}`, icon: Wallet, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/20" },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-lg font-bold mt-0.5">{c.value}</p>
                  {c.sub && <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>}
                </div>
                <div className={`p-2 rounded-lg ${c.bg}`}>
                  <c.icon size={18} className={c.color} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Monthly Chart</TabsTrigger>
          <TabsTrigger value="expenses">Expense Claims</TabsTrigger>
          <TabsTrigger value="breakdown">Category Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Monthly Cost Breakdown — {year}</CardTitle></CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => `OMR ${fmt(v)}`} />
                    <Legend />
                    <Bar dataKey="Payroll" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No payroll runs found for {year}. Run payroll to see data here.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base font-semibold">All Expense Claims</h2>
            <Select value={expenseFilter} onValueChange={setExpenseFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!expenses || expenses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No expense claims found. Click "Submit Expense" to add one.</div>
          ) : (
            <div className="space-y-2">
              {expenses.map(e => (
                <Card key={e.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{e.description}</span>
                          <Badge variant="outline" className="text-xs capitalize">{e.expenseCategory}</Badge>
                          <Badge className={`text-xs ${STATUS_COLORS[e.expenseStatus]}`}>{e.expenseStatus}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(e as any).employeeName ?? "You"} · {e.claimDate} · {e.currency} {e.amount}
                        </p>
                        {e.adminNotes && <p className="text-xs text-muted-foreground mt-0.5 italic">Note: {e.adminNotes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{e.currency} {e.amount}</span>
                        {e.expenseStatus === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => { setShowReviewDialog({ id: e.id, amount: e.amount, desc: e.description }); setReviewAction("approved"); }}>
                            Review
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="breakdown" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Approved Expenses by Category</CardTitle></CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `OMR ${fmt(v)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No approved expenses yet</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Expense Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Total Submitted", value: expenseSummary?.total ?? 0, icon: FileText, color: "text-blue-600" },
                  { label: "Approved", value: expenseSummary?.approved ?? 0, icon: CheckCircle2, color: "text-green-600" },
                  { label: "Pending Review", value: expenseSummary?.pending ?? 0, icon: Clock, color: "text-yellow-600" },
                  { label: "Rejected", value: expenseSummary?.rejected ?? 0, icon: XCircle, color: "text-red-600" },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <s.icon size={15} className={s.color} />
                      <span className="text-sm">{s.label}</span>
                    </div>
                    <span className="font-semibold text-sm">OMR {fmt(s.value)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Submit Expense Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Submit Expense Claim</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <DateInput value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["travel", "meals", "accommodation", "equipment", "communication", "training", "medical", "other"].map(c => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount</Label>
                <Input type="number" step="0.001" placeholder="0.000" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["OMR", "USD", "AED", "SAR", "EUR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea placeholder="What was this expense for?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>Cancel</Button>
            <Button onClick={() => submitExpense.mutate({ expenseDate: form.expenseDate, category: form.category as any, amount: form.amount, currency: form.currency, description: form.description })} disabled={!form.amount || !form.description || submitExpense.isPending}>
              {submitExpense.isPending ? "Processing..." : "Submit Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Expense Dialog */}
      <Dialog open={!!showReviewDialog} onOpenChange={() => setShowReviewDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Review Expense Claim</DialogTitle></DialogHeader>
          {showReviewDialog && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{showReviewDialog.desc} — <strong>OMR {showReviewDialog.amount}</strong></p>
              <div className="flex gap-2">
                <Button variant={reviewAction === "approved" ? "default" : "outline"} className="flex-1" onClick={() => setReviewAction("approved")}>
                  <CheckCircle2 size={14} className="mr-1" /> Approve
                </Button>
                <Button variant={reviewAction === "rejected" ? "destructive" : "outline"} className="flex-1" onClick={() => setReviewAction("rejected")}>
                  <XCircle size={14} className="mr-1" /> Reject
                </Button>
              </div>
              <div>
                <Label>Admin Notes (optional)</Label>
                <Textarea placeholder="Reason or notes..." value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReviewDialog(null)}>Cancel</Button>
            <Button onClick={() => showReviewDialog && reviewExpense.mutate({ id: showReviewDialog.id, action: reviewAction, adminNotes: reviewNotes || undefined })} disabled={reviewExpense.isPending}>
              {reviewExpense.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
