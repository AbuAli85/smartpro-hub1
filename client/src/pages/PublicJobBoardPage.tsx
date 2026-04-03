import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Briefcase, MapPin, Clock, Search, ChevronRight, Building2,
  Send, CheckCircle, Calendar, DollarSign, Users, RefreshCw
} from "lucide-react";
import { Link } from "wouter";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

const TYPE_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  intern: "Internship",
};

const TYPE_COLORS: Record<string, string> = {
  full_time: "bg-blue-100 text-blue-800",
  part_time: "bg-purple-100 text-purple-800",
  contract: "bg-orange-100 text-orange-800",
  intern: "bg-green-100 text-green-800",
};

const EMPTY_FORM = {
  applicantName: "",
  applicantEmail: "",
  applicantPhone: "",
  currentCompany: "",
  yearsExperience: "",
  skills: "",
  coverLetter: "",
  cvUrl: "",
};

export default function PublicJobBoardPage() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [appliedJobId, setAppliedJobId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: jobs, isLoading } = trpc.recruitment.listPublicJobs.useQuery(
    { query: query || undefined, type: typeFilter as any },
    { refetchOnWindowFocus: false }
  );

  const applyMutation = trpc.recruitment.applyForJob.useMutation({
    onSuccess: (d) => {
      toast.success(`Application submitted for "${d.jobTitle}"! We'll be in touch.`);
      setApplyOpen(false);
      setAppliedJobId(d.id);
      setForm(EMPTY_FORM);
    },
    onError: (e) => toast.error(e.message),
  });

  const openApply = (job: any) => {
    setSelectedJob(job);
    setApplyOpen(true);
  };

  const fmt = (n: string | null | undefined) => n ? `OMR ${Number(n).toFixed(3)}` : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <Briefcase size={16} className="text-white" />
              </div>
              <span className="font-bold text-white text-lg">SmartPRO Careers</span>
            </div>
          </Link>
          <Link href="/login">
            <Button variant="outline" size="sm" className="text-white border-white/30 hover:bg-white/10">
              Company Login
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-16 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Find Your Next Opportunity
        </h1>
        <p className="text-blue-200 text-lg mb-8 max-w-2xl mx-auto">
          Browse open positions from leading businesses in Oman. Apply directly and get noticed.
        </p>

        {/* Search bar */}
        <div className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-slate-400 h-11"
              placeholder="Search by title, department, or location..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40 bg-white/10 border-white/20 text-white h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="full_time">Full Time</SelectItem>
              <SelectItem value="part_time">Part Time</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="intern">Internship</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Stats bar */}
      <div className="max-w-6xl mx-auto px-4 mb-8">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-wrap gap-6 justify-center text-center">
          <div>
            <p className="text-2xl font-bold text-white">{jobs?.length ?? 0}</p>
            <p className="text-blue-300 text-sm">Open Positions</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{new Set(jobs?.map(j => j.department).filter(Boolean)).size}</p>
            <p className="text-blue-300 text-sm">Departments</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{new Set(jobs?.map(j => j.location).filter(Boolean)).size}</p>
            <p className="text-blue-300 text-sm">Locations</p>
          </div>
        </div>
      </div>

      {/* Job listings */}
      <div className="max-w-6xl mx-auto px-4 pb-16">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-blue-400" />
          </div>
        )}
        {!isLoading && !jobs?.length && (
          <div className="text-center py-16">
            <Briefcase size={48} className="mx-auto text-slate-600 mb-4" />
            <h3 className="text-white text-xl font-semibold mb-2">No positions found</h3>
            <p className="text-slate-400">Try adjusting your search or check back later for new openings.</p>
          </div>
        )}
        <div className="grid gap-4">
          {jobs?.map(job => (
            <Card
              key={job.id}
              className="bg-white/5 border-white/10 hover:bg-white/10 transition-all cursor-pointer group"
              onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
            >
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-white font-semibold text-lg group-hover:text-blue-300 transition-colors">
                        {job.title}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[job.type ?? "full_time"]}`}>
                        {TYPE_LABELS[job.type ?? "full_time"]}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                      {job.department && (
                        <span className="flex items-center gap-1">
                          <Building2 size={13} /> {job.department}
                        </span>
                      )}
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={13} /> {job.location}
                        </span>
                      )}
                      {(job.salaryMin || job.salaryMax) && (
                        <span className="flex items-center gap-1">
                          <DollarSign size={13} />
                          {job.salaryMin && fmt(job.salaryMin)}
                          {job.salaryMin && job.salaryMax && " – "}
                          {job.salaryMax && fmt(job.salaryMax)}
                        </span>
                      )}
                      {job.applicationDeadline && (
                        <span className="flex items-center gap-1">
                          <Calendar size={13} /> Deadline: {fmtDate(job.applicationDeadline)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={(e) => { e.stopPropagation(); openApply(job); }}
                    className="shrink-0 gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    Apply Now <ChevronRight size={14} />
                  </Button>
                </div>

                {/* Expanded detail */}
                {selectedJob?.id === job.id && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                    {job.description && (
                      <div>
                        <h4 className="text-white font-medium text-sm mb-1">About the Role</h4>
                        <p className="text-slate-300 text-sm whitespace-pre-wrap">{job.description}</p>
                      </div>
                    )}
                    {job.requirements && (
                      <div>
                        <h4 className="text-white font-medium text-sm mb-1">Requirements</h4>
                        <p className="text-slate-300 text-sm whitespace-pre-wrap">{job.requirements}</p>
                      </div>
                    )}
                    <div className="flex justify-end pt-2">
                      <Button onClick={() => openApply(job)} className="gap-2 bg-blue-600 hover:bg-blue-700">
                        <Send size={14} /> Apply for This Position
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Apply Dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apply: {selectedJob?.title}</DialogTitle>
            {selectedJob?.department && (
              <p className="text-sm text-muted-foreground">{selectedJob.department} · {selectedJob.location ?? "Oman"}</p>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Full Name <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Your full name"
                  value={form.applicantName}
                  onChange={e => setForm(f => ({ ...f, applicantName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Email <span className="text-red-500">*</span></Label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={form.applicantEmail}
                  onChange={e => setForm(f => ({ ...f, applicantEmail: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input
                  placeholder="+968 ..."
                  value={form.applicantPhone}
                  onChange={e => setForm(f => ({ ...f, applicantPhone: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Current Company</Label>
                <Input
                  placeholder="Where do you work now?"
                  value={form.currentCompany}
                  onChange={e => setForm(f => ({ ...f, currentCompany: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Years of Experience</Label>
                <Input
                  type="number"
                  min="0"
                  max="50"
                  placeholder="e.g. 5"
                  value={form.yearsExperience}
                  onChange={e => setForm(f => ({ ...f, yearsExperience: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Key Skills</Label>
              <Input
                placeholder="e.g. Project Management, SAP, Arabic, English"
                value={form.skills}
                onChange={e => setForm(f => ({ ...f, skills: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>CV / Resume URL (optional)</Label>
              <Input
                type="url"
                placeholder="https://drive.google.com/..."
                value={form.cvUrl}
                onChange={e => setForm(f => ({ ...f, cvUrl: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Upload your CV to Google Drive or Dropbox and paste the link</p>
            </div>
            <div className="space-y-1">
              <Label>Cover Letter</Label>
              <Textarea
                placeholder="Tell us why you're a great fit for this role..."
                rows={4}
                value={form.coverLetter}
                onChange={e => setForm(f => ({ ...f, coverLetter: e.target.value }))}
              />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
              By submitting, you agree that your information will be shared with the hiring company for recruitment purposes.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button
              onClick={() => applyMutation.mutate({
                jobId: selectedJob!.id,
                applicantName: form.applicantName,
                applicantEmail: form.applicantEmail,
                applicantPhone: form.applicantPhone || undefined,
                currentCompany: form.currentCompany || undefined,
                yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
                skills: form.skills || undefined,
                coverLetter: form.coverLetter || undefined,
                cvUrl: form.cvUrl || undefined,
              })}
              disabled={applyMutation.isPending || !form.applicantName || !form.applicantEmail}
              className="gap-2"
            >
              {applyMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
