import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, Briefcase, Calendar, Star, Send, CheckCircle, XCircle,
  Plus, Eye, Clock, Video, MapPin, FileText, RefreshCw, Trash2, Sparkles
} from "lucide-react";

const STAGES = ["applied","screening","interview","assessment","offer","hired","rejected"] as const;
type Stage = typeof STAGES[number];

const STAGE_COLORS: Record<Stage, string> = {
  applied: "bg-gray-100 text-gray-700 border-gray-200",
  screening: "bg-blue-100 text-blue-700 border-blue-200",
  interview: "bg-purple-100 text-purple-700 border-purple-200",
  assessment: "bg-amber-100 text-amber-700 border-amber-200",
  offer: "bg-orange-100 text-orange-700 border-orange-200",
  hired: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

const STAGE_LABELS: Record<Stage, string> = {
  applied: "Applied", screening: "Screening", interview: "Interview",
  assessment: "Assessment", offer: "Offer Sent", hired: "Hired", rejected: "Rejected",
};

const fmt = (n: number | string | null | undefined) => `OMR ${Number(n ?? 0).toFixed(3)}`;

export default function HRRecruitmentPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("pipeline");
  const [selectedJobId, setSelectedJobId] = useState<number | undefined>();
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [aiReport, setAiReport] = useState<any | null>(null);
  const [createJobOpen, setCreateJobOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [jobForm, setJobForm] = useState({ title: "", department: "", location: "", type: "full_time" as const, description: "", requirements: "", salaryMin: "", salaryMax: "", applicationDeadline: "" });
  const [interviewForm, setInterviewForm] = useState({ interviewType: "video" as const, scheduledAt: "", durationMinutes: 60, location: "", meetingLink: "", interviewerNames: "", notes: "" });
  const [offerForm, setOfferForm] = useState({ basicSalary: "", housingAllowance: "0", transportAllowance: "0", otherAllowances: "0", probationMonths: 3, annualLeave: 21, startDate: "", additionalTerms: "" });

  const { data: summary, refetch: refetchSummary } = trpc.recruitment.getPipelineSummary.useQuery();
  const { data: jobs, refetch: refetchJobs } = trpc.recruitment.listJobs.useQuery();
  const { data: kanban, refetch: refetchKanban } = trpc.recruitment.getPipelineKanban.useQuery(
    selectedJobId ? { jobId: selectedJobId } : undefined
  );
  const { data: interviews, refetch: refetchInterviews } = trpc.recruitment.listInterviews.useQuery();
  const { data: offers, refetch: refetchOffers } = trpc.recruitment.listOffers.useQuery();

  const createJob = trpc.recruitment.createJob.useMutation({
    onSuccess: () => { toast.success("Job posting created"); setCreateJobOpen(false); refetchJobs(); refetchSummary(); },
    onError: (e) => toast.error(e.message),
  });
  const updateJob = trpc.recruitment.updateJob.useMutation({
    onSuccess: () => { toast.success("Job updated"); refetchJobs(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteJob = trpc.recruitment.deleteJob.useMutation({
    onSuccess: () => { toast.success("Job deleted"); refetchJobs(); refetchSummary(); },
    onError: (e) => toast.error(e.message),
  });
  const updateStage = trpc.recruitment.updateApplicationStage.useMutation({
    onSuccess: () => { toast.success("Stage updated"); refetchKanban(); refetchSummary(); },
    onError: (e) => toast.error(e.message),
  });
  const scheduleInterview = trpc.recruitment.scheduleInterview.useMutation({
    onSuccess: () => { toast.success("Interview scheduled"); setScheduleOpen(false); refetchInterviews(); refetchKanban(); },
    onError: (e) => toast.error(e.message),
  });
  const updateInterview = trpc.recruitment.updateInterview.useMutation({
    onSuccess: () => { toast.success("Interview updated"); refetchInterviews(); },
    onError: (e) => toast.error(e.message),
  });
  const createOffer = trpc.recruitment.createOffer.useMutation({
    onSuccess: (d) => {
      toast.success("Offer letter created");
      setOfferOpen(false);
      refetchOffers();
      refetchKanban();
      if (d.url) window.open(d.url, "_blank");
    },
    onError: (e) => toast.error(e.message),
  });
  const sendOffer = trpc.recruitment.sendOffer.useMutation({
    onSuccess: () => { toast.success("Offer marked as sent"); refetchOffers(); },
    onError: (e) => toast.error(e.message),
  });
  const screenApp = trpc.recruitment.screenApplication.useMutation({
    onSuccess: (data) => { setAiReport(data); toast.success("AI screening complete"); },
    onError: (e) => toast.error(e.message),
  });
  const convertToEmployee = trpc.recruitment.convertToEmployee.useMutation({
    onSuccess: (d) => { toast.success(`Employee record created: ${d.name}`); setSelectedApp(null); },
    onError: (e) => toast.error(e.message),
  });
  const updateOfferStatus = trpc.recruitment.updateOfferStatus.useMutation({
    onSuccess: () => { toast.success("Offer status updated"); refetchOffers(); refetchKanban(); refetchSummary(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shadow-sm">
              <Briefcase size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">Recruitment Pipeline</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Job postings, AI CV screening, interviews, offer letters, and Omanisation quota tracking
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">AI CV Screening</span>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Public Job Board</span>
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Omanisation Tracking</span>
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Offer Letters</span>
          </div>
        </div>
        <Button onClick={() => setCreateJobOpen(true)} className="gap-2 shrink-0">
          <Plus size={16} /> Post New Job
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Open Jobs",         value: summary?.openJobs ?? 0,                   bg: "stat-gradient-1" },
          { label: "Total Candidates",  value: summary?.totalApplications ?? 0,          bg: "stat-gradient-2" },
          { label: "In Interview",      value: summary?.stageMap?.["interview"] ?? 0,   bg: "stat-gradient-gold" },
          { label: "Pending Interviews",value: summary?.pendingInterviews ?? 0,          bg: "stat-gradient-3" },
          { label: "Offers Sent",       value: summary?.pendingOffers ?? 0,              bg: "stat-gradient-4" },
        ].map(({ label, value, bg }) => (
          <div key={label} className={`${bg} rounded-2xl p-4 text-white shadow-sm`}>
            <p className="text-2xl font-black">{value}</p>
            <p className="text-xs text-white/70 mt-0.5 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pipeline">Kanban Pipeline</TabsTrigger>
          <TabsTrigger value="jobs">Job Postings</TabsTrigger>
          <TabsTrigger value="interviews">Interviews</TabsTrigger>
          <TabsTrigger value="offers">Offer Letters</TabsTrigger>
        </TabsList>

        {/* ── Kanban Pipeline ── */}
        <TabsContent value="pipeline" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedJobId ? String(selectedJobId) : "all"} onValueChange={(v) => setSelectedJobId(v === "all" ? undefined : Number(v))}>
              <SelectTrigger className="w-56"><SelectValue placeholder="All Jobs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                {jobs?.map(j => <SelectItem key={j.id} value={String(j.id)}>{j.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetchKanban()} className="gap-1"><RefreshCw size={14} /> Refresh</Button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STAGES.map(stage => (
              <div key={stage} className="min-w-[170px] flex-shrink-0">
                <div className={`rounded-t-lg px-3 py-2 text-xs font-semibold border ${STAGE_COLORS[stage]}`}>
                  {STAGE_LABELS[stage]} <span className="ml-1 opacity-70">({(kanban as any)?.[stage]?.length ?? 0})</span>
                </div>
                <div className="bg-muted/30 rounded-b-lg min-h-[200px] p-2 space-y-2 border border-t-0">
                  {((kanban as any)?.[stage] ?? []).map(({ app, job }: any) => (
                    <div key={app.id} className="bg-background rounded-lg p-3 shadow-sm border cursor-pointer hover:shadow-md transition-shadow" role="button" tabIndex={0}
                      onClick={() => setSelectedApp({ app, job })}>
                      <p className="text-xs font-semibold truncate">{app.applicantName}</p>
                      <p className="text-xs text-muted-foreground truncate">{job?.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{app.applicantEmail}</p>
                    </div>
                  ))}
                  {!((kanban as any)?.[stage]?.length) && (
                    <p className="text-xs text-muted-foreground text-center py-4">Empty</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Job Postings ── */}
        <TabsContent value="jobs" className="space-y-4">
          {!jobs?.length && <p className="text-muted-foreground text-center py-8">No job postings yet. Click "Post New Job" to get started.</p>}
          <div className="grid gap-4">
            {jobs?.map(job => (
              <Card key={job.id}>
                <CardContent className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{job.title}</h3>
                      <Badge variant="outline" className={`text-xs ${job.status === "open" ? "border-green-300 text-green-700" : "border-gray-300 text-gray-600"}`}>
                        {job.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{job.type?.replace("_", " ")}</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                      {job.department && <span>{job.department}</span>}
                      {job.location && <span className="flex flex-wrap items-center gap-1"><MapPin size={12} />{job.location}</span>}
                      {(job.salaryMin || job.salaryMax) && <span>{job.salaryMin && fmt(job.salaryMin)} — {job.salaryMax && fmt(job.salaryMax)}</span>}
                      <span className="flex flex-wrap items-center gap-1"><Users size={12} />{(job as any).applicationCount ?? 0} applicants</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {job.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => updateJob.mutate({ id: job.id, status: "open" })} className="text-green-600 gap-1">
                        <CheckCircle size={14} /> Publish
                      </Button>
                    )}
                    {job.status === "open" && (
                      <Button size="sm" variant="outline" onClick={() => updateJob.mutate({ id: job.id, status: "closed" })} className="text-gray-600">
                        Close
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setSelectedJobId(job.id); setActiveTab("pipeline"); }}>
                      <Eye size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteJob.mutate({ id: job.id })}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Interviews ── */}
        <TabsContent value="interviews" className="space-y-4">
          {!interviews?.length && <p className="text-muted-foreground text-center py-8">No interviews scheduled yet.</p>}
          <div className="grid gap-3">
            {interviews?.map(({ interview, app, job }: any) => (
              <Card key={interview.id}>
                <CardContent className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{app?.applicantName}</p>
                      <Badge variant="outline" className="text-xs">{interview.interviewType?.replace("_", " ")}</Badge>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${interview.status === "scheduled" ? "bg-blue-100 text-blue-700" : interview.status === "completed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {interview.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{job?.title}</p>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                      <span className="flex flex-wrap items-center gap-1"><Calendar size={12} />{new Date(interview.scheduledAt).toLocaleString()}</span>
                      <span className="flex flex-wrap items-center gap-1"><Clock size={12} />{interview.durationMinutes} min</span>
                      {interview.meetingLink && <a href={interview.meetingLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline"><Video size={12} /> Join</a>}
                      {interview.location && <span className="flex flex-wrap items-center gap-1"><MapPin size={12} />{interview.location}</span>}
                    </div>
                    {interview.feedback && <p className="text-sm mt-2 text-muted-foreground italic">"{interview.feedback}"</p>}
                    {interview.rating && (
                      <div className="flex items-center gap-0.5 mt-1">
                        {[1,2,3,4,5].map(r => (
                          <Star key={r} size={14} className={r <= interview.rating ? "text-amber-400 fill-amber-400" : "text-gray-300"} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {interview.status === "scheduled" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateInterview.mutate({ id: interview.id, status: "completed" })} className="text-green-600 gap-1">
                          <CheckCircle size={14} /> Done
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateInterview.mutate({ id: interview.id, status: "cancelled" })} className="text-red-500">
                          <XCircle size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Offer Letters ── */}
        <TabsContent value="offers" className="space-y-4">
          {!offers?.length && <p className="text-muted-foreground text-center py-8">No offer letters yet.</p>}
          <div className="grid gap-3">
            {offers?.map(offer => (
              <Card key={offer.id}>
                <CardContent className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{offer.applicantName}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        offer.status === "accepted" ? "bg-green-100 text-green-700" :
                        offer.status === "rejected" ? "bg-red-100 text-red-700" :
                        offer.status === "sent" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>{offer.status}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{offer.position}{offer.department ? ` — ${offer.department}` : ""}</p>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                      <span className="font-medium text-foreground">{fmt(offer.totalPackage)}/month</span>
                      {offer.startDate && <span>Start: {new Date(offer.startDate).toLocaleDateString()}</span>}
                      {offer.expiresAt && <span>Expires: {new Date(offer.expiresAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {offer.letterUrl && (
                      <a href={offer.letterUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="gap-1"><FileText size={14} /> View</Button>
                      </a>
                    )}
                    {offer.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => sendOffer.mutate({ id: offer.id })} className="text-blue-600 gap-1">
                        <Send size={14} /> Send
                      </Button>
                    )}
                    {offer.status === "sent" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateOfferStatus.mutate({ id: offer.id, status: "accepted" })} className="text-green-600 gap-1">
                          <CheckCircle size={14} /> Accept
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateOfferStatus.mutate({ id: offer.id, status: "rejected" })} className="text-red-500 gap-1">
                          <XCircle size={14} /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Application Detail / Move Stage Dialog ── */}
      <Dialog open={!!selectedApp} onOpenChange={(o) => !o && setSelectedApp(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{selectedApp?.app?.applicantName}</DialogTitle></DialogHeader>
          {selectedApp && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Email</p><p className="font-medium">{selectedApp.app.applicantEmail}</p></div>
                <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{selectedApp.app.applicantPhone ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Position</p><p className="font-medium">{selectedApp.job?.title}</p></div>
                <div><p className="text-muted-foreground">Applied</p><p className="font-medium">{new Date(selectedApp.app.createdAt).toLocaleDateString()}</p></div>
              </div>
              {selectedApp.app.resumeUrl && (
                <a href={selectedApp.app.resumeUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2"><FileText size={14} /> View Resume</Button>
                </a>
              )}
              <div className="space-y-2">
                <Label>Move to Stage</Label>
                <div className="flex flex-wrap gap-2">
                  {STAGES.filter(s => s !== selectedApp.app.stage).map(s => (
                    <Button key={s} size="sm" variant="outline"
                      className={`text-xs ${STAGE_COLORS[s]}`}
                      onClick={() => { updateStage.mutate({ id: selectedApp.app.id, stage: s }); setSelectedApp(null); }}>
                      {STAGE_LABELS[s]}
                    </Button>
                  ))}
                </div>
              </div>
              {aiReport && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm flex items-center gap-1"><Sparkles size={13} className="text-blue-600" /> AI Screening Result</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      aiReport.score >= 70 ? "bg-green-100 text-green-800" :
                      aiReport.score >= 40 ? "bg-yellow-100 text-yellow-800" :
                      "bg-red-100 text-red-800"
                    }`}>{aiReport.score}/100</span>
                  </div>
                  {aiReport.summary && <p className="text-xs text-muted-foreground">{aiReport.summary}</p>}
                  {aiReport.strengths?.length > 0 && (
                    <div><p className="text-xs font-medium text-green-700 mb-0.5">Strengths</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">{aiReport.strengths.map((s: string, i: number) => <li key={i}>• {s}</li>)}</ul></div>
                  )}
                  {aiReport.gaps?.length > 0 && (
                    <div><p className="text-xs font-medium text-red-700 mb-0.5">Gaps</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">{aiReport.gaps.map((g: string, i: number) => <li key={i}>• {g}</li>)}</ul></div>
                  )}
                  <p className="text-xs font-medium capitalize">Recommendation: <span className="text-blue-700">{aiReport.recommendation?.replace("_", " ")}</span></p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setScheduleOpen(true)} className="gap-1">
                  <Calendar size={14} /> Schedule Interview
                </Button>
                <Button variant="outline" size="sm" onClick={() => setOfferOpen(true)} className="gap-1">
                  <FileText size={14} /> Create Offer
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => { setAiReport(null); screenApp.mutate({ applicationId: selectedApp.app.id }); }}
                  disabled={screenApp.isPending}
                  className="gap-1 text-blue-600 border-blue-300 hover:bg-blue-50">
                  {screenApp.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  AI Screen
                </Button>
                {selectedApp?.app?.stage === "offer" && (
                  <Button size="sm"
                    onClick={() => convertToEmployee.mutate({ applicationId: selectedApp.app.id, startDate: new Date().toISOString().slice(0,10) })}
                    disabled={convertToEmployee.isPending}
                    className="gap-1 bg-green-600 hover:bg-green-700">
                    <CheckCircle size={13} /> Convert to Employee
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Job Dialog ── */}
      <Dialog open={createJobOpen} onOpenChange={setCreateJobOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Post New Job</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1"><Label>Job Title *</Label><Input value={jobForm.title} onChange={e => setJobForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Senior Accountant" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Department</Label><Input value={jobForm.department} onChange={e => setJobForm(f => ({ ...f, department: e.target.value }))} placeholder="Finance" /></div>
              <div className="space-y-1"><Label>Location</Label><Input value={jobForm.location} onChange={e => setJobForm(f => ({ ...f, location: e.target.value }))} placeholder="Muscat" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={jobForm.type} onValueChange={(v) => setJobForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full Time</SelectItem>
                    <SelectItem value="part_time">Part Time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Application Deadline</Label><Input type="date" value={jobForm.applicationDeadline} onChange={e => setJobForm(f => ({ ...f, applicationDeadline: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Min Salary (OMR)</Label><Input type="number" value={jobForm.salaryMin} onChange={e => setJobForm(f => ({ ...f, salaryMin: e.target.value }))} placeholder="500" /></div>
              <div className="space-y-1"><Label>Max Salary (OMR)</Label><Input type="number" value={jobForm.salaryMax} onChange={e => setJobForm(f => ({ ...f, salaryMax: e.target.value }))} placeholder="1200" /></div>
            </div>
            <div className="space-y-1"><Label>Description</Label><Textarea value={jobForm.description} onChange={e => setJobForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Role overview and responsibilities..." /></div>
            <div className="space-y-1"><Label>Requirements</Label><Textarea value={jobForm.requirements} onChange={e => setJobForm(f => ({ ...f, requirements: e.target.value }))} rows={3} placeholder="Qualifications and skills required..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateJobOpen(false)}>Cancel</Button>
            <Button onClick={() => createJob.mutate({ ...jobForm, salaryMin: jobForm.salaryMin ? Number(jobForm.salaryMin) : undefined, salaryMax: jobForm.salaryMax ? Number(jobForm.salaryMax) : undefined })} disabled={!jobForm.title || createJob.isPending}>
              {createJob.isPending ? <RefreshCw size={14} className="animate-spin mr-2" /> : null} Create Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Schedule Interview Dialog ── */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Schedule Interview — {selectedApp?.app?.applicantName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={interviewForm.interviewType} onValueChange={(v) => setInterviewForm(f => ({ ...f, interviewType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">Video Call</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="in_person">In Person</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="panel">Panel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Duration (min)</Label><Input type="number" value={interviewForm.durationMinutes} onChange={e => setInterviewForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))} /></div>
            </div>
            <div className="space-y-1"><Label>Date & Time *</Label><Input type="datetime-local" value={interviewForm.scheduledAt} onChange={e => setInterviewForm(f => ({ ...f, scheduledAt: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Meeting Link</Label><Input value={interviewForm.meetingLink} onChange={e => setInterviewForm(f => ({ ...f, meetingLink: e.target.value }))} placeholder="https://meet.google.com/..." /></div>
            <div className="space-y-1"><Label>Interviewers</Label><Input value={interviewForm.interviewerNames} onChange={e => setInterviewForm(f => ({ ...f, interviewerNames: e.target.value }))} placeholder="Ahmed Al-Rashidi, Sara Al-Balushi" /></div>
            <div className="space-y-1"><Label>Notes</Label><Textarea value={interviewForm.notes} onChange={e => setInterviewForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button onClick={() => selectedApp && scheduleInterview.mutate({ applicationId: selectedApp.app.id, ...interviewForm })} disabled={!interviewForm.scheduledAt || scheduleInterview.isPending}>
              {scheduleInterview.isPending ? <RefreshCw size={14} className="animate-spin mr-2" /> : null} Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Offer Dialog ── */}
      <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Offer — {selectedApp?.app?.applicantName}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Basic Salary (OMR) *</Label><Input type="number" step="0.001" value={offerForm.basicSalary} onChange={e => setOfferForm(f => ({ ...f, basicSalary: e.target.value }))} placeholder="600.000" /></div>
              <div className="space-y-1"><Label>Housing Allowance</Label><Input type="number" step="0.001" value={offerForm.housingAllowance} onChange={e => setOfferForm(f => ({ ...f, housingAllowance: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Transport Allowance</Label><Input type="number" step="0.001" value={offerForm.transportAllowance} onChange={e => setOfferForm(f => ({ ...f, transportAllowance: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Other Allowances</Label><Input type="number" step="0.001" value={offerForm.otherAllowances} onChange={e => setOfferForm(f => ({ ...f, otherAllowances: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Start Date</Label><Input type="date" value={offerForm.startDate} onChange={e => setOfferForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Probation (months)</Label><Input type="number" value={offerForm.probationMonths} onChange={e => setOfferForm(f => ({ ...f, probationMonths: Number(e.target.value) }))} /></div>
              <div className="space-y-1"><Label>Annual Leave (days)</Label><Input type="number" value={offerForm.annualLeave} onChange={e => setOfferForm(f => ({ ...f, annualLeave: Number(e.target.value) }))} /></div>
            </div>
            {offerForm.basicSalary && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <strong>Total Package:</strong> {fmt(Number(offerForm.basicSalary) + Number(offerForm.housingAllowance) + Number(offerForm.transportAllowance) + Number(offerForm.otherAllowances))}/month
              </div>
            )}
            <div className="space-y-1"><Label>Additional Terms</Label><Textarea value={offerForm.additionalTerms} onChange={e => setOfferForm(f => ({ ...f, additionalTerms: e.target.value }))} rows={3} placeholder="Any additional conditions..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferOpen(false)}>Cancel</Button>
            <Button onClick={() => selectedApp && createOffer.mutate({
              applicationId: selectedApp.app.id,
              jobId: selectedApp.app.jobId,
              applicantName: selectedApp.app.applicantName,
              applicantEmail: selectedApp.app.applicantEmail,
              position: selectedApp.job?.title ?? "Position",
              department: selectedApp.job?.department,
              basicSalary: Number(offerForm.basicSalary),
              housingAllowance: Number(offerForm.housingAllowance),
              transportAllowance: Number(offerForm.transportAllowance),
              otherAllowances: Number(offerForm.otherAllowances),
              probationMonths: offerForm.probationMonths,
              annualLeave: offerForm.annualLeave,
              startDate: offerForm.startDate || undefined,
              additionalTerms: offerForm.additionalTerms || undefined,
            })} disabled={!offerForm.basicSalary || createOffer.isPending}>
              {createOffer.isPending ? <RefreshCw size={14} className="animate-spin mr-2" /> : null} Generate Offer Letter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
