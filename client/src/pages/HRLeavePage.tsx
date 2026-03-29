import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Calendar, DollarSign, Plus, Clock, CheckCircle2,
  XCircle, AlertCircle, Users, TrendingUp, FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";

const leaveTypeColors: Record<string, string> = {
  annual: "bg-blue-100 text-blue-700",
  sick: "bg-red-100 text-red-700",
  maternity: "bg-pink-100 text-pink-700",
  paternity: "bg-purple-100 text-purple-700",
  unpaid: "bg-gray-100 text-gray-700",
  emergency: "bg-orange-100 text-orange-700",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock size={14} className="text-amber-500" />,
  approved: <CheckCircle2 size={14} className="text-green-500" />,
  rejected: <XCircle size={14} className="text-red-500" />,
};

export default function HRLeavePage() {
  const { user } = useAuth();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [leaveFilter, setLeaveFilter] = useState<string>("all");
  const [leaveForm, setLeaveForm] = useState({
    leaveType: "annual",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [payrollForm, setPayrollForm] = useState({
    employeeId: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    basicSalary: "",
    allowances: "",
    deductions: "",
  });

  const { data: leaveRequests, refetch: refetchLeave } = trpc.hr.listLeave.useQuery({});
  const { data: payrollRecords, refetch: refetchPayroll } = trpc.hr.listPayroll.useQuery({});
  const { data: employees } = trpc.hr.listEmployees.useQuery({});

  const createLeave = trpc.hr.createLeave.useMutation({
    onSuccess: () => {
      toast.success("Leave request submitted successfully");
      setLeaveOpen(false);
      setLeaveForm({ leaveType: "annual", startDate: "", endDate: "", reason: "" });
      refetchLeave();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLeave = trpc.hr.updateLeave.useMutation({
    onSuccess: () => { toast.success("Leave status updated"); refetchLeave(); },
    onError: (e) => toast.error(e.message),
  });

  const createPayroll = trpc.hr.createPayroll.useMutation({
    onSuccess: () => {
      toast.success("Payroll record created");
      setPayrollOpen(false);
      refetchPayroll();
    },
    onError: (e) => toast.error(e.message),
  });

  const isAdmin = user?.role === "admin";

  // Payroll stats
  const totalPayroll = payrollRecords?.reduce((sum, r) => sum + Number(r.netSalary ?? 0), 0) ?? 0;
  const pendingLeave = leaveRequests?.filter((l) => l.status === "pending").length ?? 0;
  const approvedLeave = leaveRequests?.filter((l) => l.status === "approved").length ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center shadow-sm">
              <Calendar size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">Leave Management</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Annual leave, sick leave, Oman public holidays, and payroll record management per MHRSD guidelines
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">MHRSD Compliant</span>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Annual Leave</span>
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Sick Leave</span>
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Oman Holidays</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Plus size={14} /> Request Leave
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Leave Request</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Leave Type</Label>
                  <Select value={leaveForm.leaveType} onValueChange={(v) => setLeaveForm({ ...leaveForm, leaveType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["annual", "sick", "maternity", "paternity", "unpaid", "emergency"].map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Reason (optional)</Label>
                  <Input placeholder="Brief reason for leave..." value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    if (!leaveForm.startDate || !leaveForm.endDate) { toast.error("Please select start and end dates"); return; }
                    createLeave.mutate({
                      employeeId: 0,
                      leaveType: leaveForm.leaveType as "annual" | "sick" | "emergency" | "maternity" | "paternity" | "unpaid" | "other",
                      startDate: leaveForm.startDate,
                      endDate: leaveForm.endDate,
                      days: Math.max(1, Math.ceil((new Date(leaveForm.endDate).getTime() - new Date(leaveForm.startDate).getTime()) / 86400000) + 1),
                      reason: leaveForm.reason || undefined,
                    });
                  }}
                  disabled={createLeave.isPending}
                >
                  {createLeave.isPending ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {isAdmin && (
            <Dialog open={payrollOpen} onOpenChange={setPayrollOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2 bg-[var(--smartpro-orange)] hover:bg-orange-600">
                  <DollarSign size={14} /> Add Payroll
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Payroll Record</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Employee</Label>
                    <Select value={payrollForm.employeeId} onValueChange={(v) => setPayrollForm({ ...payrollForm, employeeId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>
                        {employees?.map((e) => (
                          <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Month</Label>
                      <Select value={String(payrollForm.month)} onValueChange={(v) => setPayrollForm({ ...payrollForm, month: Number(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>
                              {new Date(2024, i).toLocaleString("default", { month: "long" })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Year</Label>
                      <Input type="number" value={payrollForm.year} onChange={(e) => setPayrollForm({ ...payrollForm, year: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <Label>Basic Salary (OMR)</Label>
                      <Input type="number" placeholder="0.00" value={payrollForm.basicSalary} onChange={(e) => setPayrollForm({ ...payrollForm, basicSalary: e.target.value })} />
                    </div>
                    <div>
                      <Label>Allowances</Label>
                      <Input type="number" placeholder="0.00" value={payrollForm.allowances} onChange={(e) => setPayrollForm({ ...payrollForm, allowances: e.target.value })} />
                    </div>
                    <div>
                      <Label>Deductions</Label>
                      <Input type="number" placeholder="0.00" value={payrollForm.deductions} onChange={(e) => setPayrollForm({ ...payrollForm, deductions: e.target.value })} />
                    </div>
                  </div>
                  {payrollForm.basicSalary && (
                    <div className="bg-muted rounded-lg p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Basic Salary</span>
                        <span>OMR {Number(payrollForm.basicSalary).toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">+ Allowances</span>
                        <span>OMR {Number(payrollForm.allowances || 0).toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">- Deductions</span>
                        <span>OMR {Number(payrollForm.deductions || 0).toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t mt-1 pt-1">
                        <span>Net Salary</span>
                        <span className="text-green-600">
                          OMR {(Number(payrollForm.basicSalary) + Number(payrollForm.allowances || 0) - Number(payrollForm.deductions || 0)).toFixed(3)}
                        </span>
                      </div>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (!payrollForm.employeeId || !payrollForm.basicSalary) { toast.error("Please fill required fields"); return; }
                      const basic = Number(payrollForm.basicSalary);
                      const allowances = Number(payrollForm.allowances || 0);
                      const deductions = Number(payrollForm.deductions || 0);
                      createPayroll.mutate({
                        employeeId: Number(payrollForm.employeeId),
                        periodMonth: payrollForm.month,
                        periodYear: payrollForm.year,
                        basicSalary: basic,
                        allowances: allowances,
                        deductions: deductions,
                        taxAmount: 0,
                      });
                    }}
                    disabled={createPayroll.isPending}
                  >
                    {createPayroll.isPending ? "Creating..." : "Create Payroll Record"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock size={16} className="text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingLeave}</p>
                <p className="text-xs text-muted-foreground">Pending Leave</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                <CheckCircle2 size={16} className="text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{approvedLeave}</p>
                <p className="text-xs text-muted-foreground">Approved Leave</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <FileText size={16} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{payrollRecords?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Payroll Records</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
                <DollarSign size={16} className="text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">OMR {totalPayroll.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Total Payroll</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="leave">
        <TabsList>
          <TabsTrigger value="leave">Leave Requests</TabsTrigger>
          <TabsTrigger value="payroll">Payroll Records</TabsTrigger>
        </TabsList>

        <TabsContent value="leave" className="mt-4">
          {/* Filter */}
          <div className="flex gap-2 mb-4">
            {["all", "pending", "approved", "rejected"].map((s) => (
              <Button
                key={s}
                variant={leaveFilter === s ? "default" : "outline"}
                size="sm"
                className={`capitalize text-xs ${leaveFilter === s ? "bg-[var(--smartpro-orange)] hover:bg-orange-600" : ""}`}
                onClick={() => setLeaveFilter(s)}
              >
                {s}
              </Button>
            ))}
          </div>

          {!leaveRequests || leaveRequests.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Calendar size={32} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No leave requests found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {leaveRequests.map((req) => (
                <Card key={req.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{statusIcons[req.status ?? "pending"]}</div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm">Employee #{req.employeeId}</span>
                            <Badge className={`text-[10px] capitalize ${leaveTypeColors[req.leaveType ?? "annual"] ?? "bg-gray-100 text-gray-700"}`} variant="outline">
                              {req.leaveType}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {req.startDate ? new Date(req.startDate).toLocaleDateString() : "N/A"} →{" "}
                            {req.endDate ? new Date(req.endDate).toLocaleDateString() : "N/A"}
                          </p>
                          {req.reason && <p className="text-xs text-muted-foreground mt-1 italic">"{req.reason}"</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={`text-[10px] capitalize ${
                          req.status === "approved" ? "bg-green-100 text-green-700" :
                          req.status === "rejected" ? "bg-red-100 text-red-700" :
                          "bg-amber-100 text-amber-700"
                        }`} variant="outline">
                          {req.status}
                        </Badge>
                        {isAdmin && req.status === "pending" && (
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
                              onClick={() => updateLeave.mutate({ id: req.id, status: "approved" })}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => updateLeave.mutate({ id: req.id, status: "rejected" })}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payroll" className="mt-4">
          {!payrollRecords || payrollRecords.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <DollarSign size={32} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No payroll records yet</p>
                {isAdmin && (
                  <Button size="sm" className="mt-3" onClick={() => setPayrollOpen(true)}>
                    Create First Payroll
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th scope="col" className="text-left py-2 px-3 font-medium">Employee</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Period</th>
                    <th scope="col" className="text-right py-2 px-3 font-medium">Basic</th>
                    <th scope="col" className="text-right py-2 px-3 font-medium">Allowances</th>
                    <th scope="col" className="text-right py-2 px-3 font-medium">Deductions</th>
                    <th scope="col" className="text-right py-2 px-3 font-medium">Net Salary</th>
                    <th scope="col" className="text-center py-2 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollRecords.map((rec) => (
                    <tr key={rec.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium">Employee #{rec.employeeId}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {new Date(2024, (rec.periodMonth ?? 1) - 1).toLocaleString("default", { month: "short" })} {rec.periodYear}
                      </td>
                      <td className="py-2.5 px-3 text-right">OMR {Number(rec.basicSalary ?? 0).toFixed(3)}</td>
                      <td className="py-2.5 px-3 text-right text-green-600">+{Number(rec.allowances ?? 0).toFixed(3)}</td>
                      <td className="py-2.5 px-3 text-right text-red-600">-{Number(rec.deductions ?? 0).toFixed(3)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold">OMR {Number(rec.netSalary ?? 0).toFixed(3)}</td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge className={`text-[10px] capitalize ${
                          rec.status === "paid" ? "bg-green-100 text-green-700" :
                          rec.status === "approved" ? "bg-blue-100 text-blue-700" :
                          "bg-amber-100 text-amber-700"
                        }`} variant="outline">
                          {rec.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
