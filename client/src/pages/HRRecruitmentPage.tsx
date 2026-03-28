import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { BookOpen, Plus, Users, Briefcase, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const stageColors: Record<string, string> = {
  applied: "bg-gray-100 text-gray-700",
  screening: "bg-blue-100 text-blue-700",
  interview: "bg-purple-100 text-purple-700",
  assessment: "bg-indigo-100 text-indigo-700",
  offer: "bg-amber-100 text-amber-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function NewJobDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    department: "",
    location: "",
    type: "full_time" as const,
    description: "",
    requirements: "",
    salaryMin: "",
    salaryMax: "",
    applicationDeadline: "",
  });

  const createMutation = trpc.hr.createJob.useMutation({
    onSuccess: () => { toast.success("Job posting created"); setOpen(false); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Plus size={16} /> Post Job</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Post New Job</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Job Title *</Label>
            <Input placeholder="e.g. PRO Officer" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input placeholder="e.g. Operations" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input placeholder="e.g. Muscat" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Employment Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full Time</SelectItem>
                  <SelectItem value="part_time">Part Time</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="intern">Intern</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Application Deadline</Label>
              <Input type="date" value={form.applicationDeadline} onChange={(e) => setForm({ ...form, applicationDeadline: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Salary Min (OMR)</Label>
              <Input type="number" placeholder="0" value={form.salaryMin} onChange={(e) => setForm({ ...form, salaryMin: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Salary Max (OMR)</Label>
              <Input type="number" placeholder="0" value={form.salaryMax} onChange={(e) => setForm({ ...form, salaryMax: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Job Description</Label>
            <Textarea placeholder="Describe the role..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Requirements</Label>
            <Textarea placeholder="List requirements..." value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} rows={3} />
          </div>
          <Button className="w-full" disabled={!form.title || createMutation.isPending}
            onClick={() => createMutation.mutate({
              ...form,
              salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
              salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
            })}>
            {createMutation.isPending ? "Posting..." : "Post Job"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function HRRecruitmentPage() {
  const [selectedJob, setSelectedJob] = useState<number | null>(null);

  const { data: jobs, refetch: refetchJobs } = trpc.hr.listJobs.useQuery();
  const { data: applications, refetch: refetchApps } = trpc.hr.listApplications.useQuery({ jobId: selectedJob ?? undefined });

  const updateJobMutation = trpc.hr.updateJob.useMutation({
    onSuccess: () => { toast.success("Updated"); refetchJobs(); },
    onError: (e) => toast.error(e.message),
  });

  const updateAppMutation = trpc.hr.updateApplication.useMutation({
    onSuccess: () => { toast.success("Stage updated"); refetchApps(); },
    onError: (e) => toast.error(e.message),
  });

  const stats = {
    openJobs: jobs?.filter((j) => j.status === "open").length ?? 0,
    totalApps: applications?.length ?? 0,
    inInterview: applications?.filter((a) => a.stage === "interview").length ?? 0,
    hired: applications?.filter((a) => a.stage === "hired").length ?? 0,
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen size={24} className="text-[var(--smartpro-orange)]" />
            Recruitment (ATS)
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage job postings and applicant tracking</p>
        </div>
        <NewJobDialog onSuccess={refetchJobs} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Open Positions", value: stats.openJobs, icon: <Briefcase size={18} />, color: "text-blue-600 bg-blue-50" },
          { label: "Total Applicants", value: stats.totalApps, icon: <Users size={18} />, color: "text-purple-600 bg-purple-50" },
          { label: "In Interview", value: stats.inInterview, icon: <BookOpen size={18} />, color: "text-amber-600 bg-amber-50" },
          { label: "Hired", value: stats.hired, icon: <CheckCircle2 size={18} />, color: "text-green-600 bg-green-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Jobs list */}
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Job Postings</h2>
          {jobs?.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Briefcase size={32} className="mx-auto text-muted-foreground mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">No job postings yet</p>
              </CardContent>
            </Card>
          ) : (
            jobs?.map((job) => (
              <Card
                key={job.id}
                className={`cursor-pointer transition-all hover:shadow-md ${selectedJob === job.id ? "ring-2 ring-[var(--smartpro-orange)]" : ""}`}
                onClick={() => setSelectedJob(job.id === selectedJob ? null : job.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{job.title}</h3>
                      {job.department && <p className="text-xs text-muted-foreground">{job.department}</p>}
                      {job.location && <p className="text-xs text-muted-foreground">{job.location}</p>}
                    </div>
                    <Badge className={`text-xs ${job.status === "open" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`} variant="outline">
                      {job.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-muted-foreground capitalize">{job.type?.replace(/_/g, " ")}</span>
                    <Select value={job.status ?? "open"} onValueChange={(v) => updateJobMutation.mutate({ id: job.id, status: v as any })}>
                      <SelectTrigger className="h-6 text-xs w-24 border-0 bg-transparent p-0">
                        <span className="text-muted-foreground text-xs">Change</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
                        <SelectItem value="closed">Close</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Applications */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            {selectedJob ? "Applications" : "All Applications"}
          </h2>
          {applications?.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Users size={32} className="mx-auto text-muted-foreground mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">No applications yet</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Applicant</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Stage</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Applied</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Move to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications?.map((app) => (
                      <tr key={app.id} className="border-b hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="font-medium">{app.applicantName}</div>
                          {app.applicantEmail && <div className="text-xs text-muted-foreground">{app.applicantEmail}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs ${stageColors[app.stage ?? "applied"]}`} variant="outline">
                            {app.stage}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(app.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <Select value={app.stage ?? "applied"} onValueChange={(v) => updateAppMutation.mutate({ id: app.id, stage: v as any })}>
                            <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="applied">Applied</SelectItem>
                              <SelectItem value="screening">Screening</SelectItem>
                              <SelectItem value="interview">Interview</SelectItem>
                              <SelectItem value="assessment">Assessment</SelectItem>
                              <SelectItem value="offer">Offer</SelectItem>
                              <SelectItem value="hired">Hired</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
