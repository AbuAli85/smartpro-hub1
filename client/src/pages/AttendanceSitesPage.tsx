/**
 * AttendanceSitesPage — Admin page to manage attendance sites and QR codes
 *
 * Route: /hr/attendance-sites
 * Access: company_admin, hr_admin
 *
 * Features:
 *   - Create / edit / deactivate attendance sites
 *   - View QR code for each site (for printing / displaying)
 *   - Live attendance board — who is checked in right now
 *   - Attendance history with date filter
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  QrCode, Plus, MapPin, Users, Clock, CheckCircle2,
  LogOut, Building2, ToggleLeft, ToggleRight, Edit2,
  RefreshCw, Download, Copy, Calendar,
} from "lucide-react";

function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function AttendanceSitesPage() {
  const { activeCompany } = useActiveCompany();
  const companyId = activeCompany?.id;

  const [showCreate, setShowCreate] = useState(false);
  const [editSite, setEditSite] = useState<any>(null);
  const [showQR, setShowQR] = useState<any>(null);
  const [historyDate, setHistoryDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: sites = [], refetch: refetchSites } = trpc.attendance.listSites.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );

  const { data: liveBoard = [], refetch: refetchLive } = trpc.attendance.adminBoard.useQuery(
    { companyId: companyId, date: new Date().toISOString().slice(0, 10) },
    { enabled: !!companyId, refetchInterval: 30000 }
  );

  const { data: history = [] } = trpc.attendance.adminBoard.useQuery(
    { companyId: companyId, date: historyDate },
    { enabled: !!companyId }
  );

  const createMutation = trpc.attendance.createSite.useMutation({
    onSuccess: () => { toast.success("Site created"); setShowCreate(false); refetchSites(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.attendance.updateSite.useMutation({
    onSuccess: () => { toast.success("Site updated"); setEditSite(null); refetchSites(); },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleMutation = trpc.attendance.toggleSite.useMutation({
    onSuccess: () => { refetchSites(); },
    onError: (err: any) => toast.error(err.message),
  });

  const [form, setForm] = useState({ name: "", location: "", notes: "" });

  function openCreate() {
    setForm({ name: "", location: "", notes: "" });
    setShowCreate(true);
  }

  function openEdit(site: any) {
    setForm({ name: site.name, location: site.location ?? "", notes: site.notes ?? "" });
    setEditSite(site);
  }

  function handleSubmit() {
    if (!companyId || !form.name.trim()) return;
    if (editSite) {
      updateMutation.mutate({ siteId: editSite.id, ...form });
    } else {
      createMutation.mutate({ companyId: companyId!, ...form });
    }
  }

  function copyQrLink(token: string) {
    const url = `${window.location.origin}/attend/${token}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copied!"));
  }

  const checkedInCount = liveBoard.filter((r: any) => !r.checkOut).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Attendance Sites</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage QR check-in locations and monitor live attendance
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> New Site
        </Button>
      </div>

      {/* Live summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{checkedInCount}</p>
                <p className="text-xs text-muted-foreground">Currently Checked In</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{sites.filter((s: any) => s.isActive).length}</p>
                <p className="text-xs text-muted-foreground">Active Sites</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{history.length}</p>
                <p className="text-xs text-muted-foreground">Records Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sites">
        <TabsList>
          <TabsTrigger value="sites">Sites & QR Codes</TabsTrigger>
          <TabsTrigger value="live">
            Live Board
            {checkedInCount > 0 && (
              <Badge className="ml-2 bg-green-500 text-white text-xs px-1.5 py-0">{checkedInCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ── Sites tab ── */}
        <TabsContent value="sites" className="mt-4">
          {sites.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <QrCode className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="font-medium">No attendance sites yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a site to generate a QR code for employee check-in
                </p>
                <Button onClick={openCreate} variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" /> Create First Site
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sites.map((site: any) => (
                <Card key={site.id} className={!site.isActive ? "opacity-60" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{site.name}</CardTitle>
                        {site.location && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{site.location}</span>
                          </p>
                        )}
                      </div>
                      <Badge variant={site.isActive ? "default" : "secondary"} className="shrink-0">
                        {site.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* QR preview placeholder */}
                    <div
                      className="w-full aspect-square max-w-[140px] mx-auto bg-muted rounded-lg flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors border-2 border-dashed border-border"
                      onClick={() => setShowQR(site)}
                    >
                      <div className="text-center">
                        <QrCode className="w-10 h-10 text-muted-foreground mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">Click to view QR</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1"
                        onClick={() => copyQrLink(site.qrToken)}
                      >
                        <Copy className="w-3 h-3" /> Copy Link
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => openEdit(site)}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => toggleMutation.mutate({ siteId: site.id, isActive: !site.isActive })}
                      >
                        {site.isActive ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Live board tab ── */}
        <TabsContent value="live" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">Auto-refreshes every 30 seconds</p>
            <Button size="sm" variant="outline" onClick={() => refetchLive()} className="gap-2">
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
          </div>
          {liveBoard.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No attendance records today</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {liveBoard.map((record: any) => (
                <Card key={record.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${!record.checkOut ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {record.employee?.firstName} {record.employee?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {record.site?.name} {record.employee?.department ? `· ${record.employee.department}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3 text-green-500" />
                          {fmtTime(record.checkIn)}
                        </p>
                        {record.checkOut ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <LogOut className="w-3 h-3" />
                            {fmtTime(record.checkOut)}
                          </p>
                        ) : (
                          <Badge variant="outline" className="text-xs border-green-500/50 text-green-600">In</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── History tab ── */}
        <TabsContent value="history" className="mt-4">
          <div className="flex items-center gap-3 mb-4">
            <Label className="shrink-0">Date</Label>
            <Input
              type="date"
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="w-auto"
            />
          </div>
          {history.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No records for {fmtDate(historyDate)}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Employee</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Site</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Check In</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Check Out</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">GPS</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((record: any) => (
                    <tr key={record.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-3">
                        {record.employee?.firstName} {record.employee?.lastName}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{record.site?.name ?? "—"}</td>
                      <td className="py-2 px-3 font-medium text-green-600">{fmtTime(record.checkIn)}</td>
                      <td className="py-2 px-3 text-muted-foreground">{fmtTime(record.checkOut)}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">
                        {record.checkInLat ? `${Number(record.checkInLat).toFixed(4)}, ${Number(record.checkInLng).toFixed(4)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit dialog ── */}
      <Dialog open={showCreate || !!editSite} onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditSite(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editSite ? "Edit Site" : "New Attendance Site"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Site Name *</Label>
              <Input
                placeholder="e.g. Lulu Mall — Promotions"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Location / Address</Label>
              <Input
                placeholder="e.g. Lulu Hypermarket, Muscat"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes for this site"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditSite(null); }}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {editSite ? "Save Changes" : "Create Site"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── QR Code dialog ── */}
      <Dialog open={!!showQR} onOpenChange={(o) => { if (!o) setShowQR(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" /> {showQR?.name}
            </DialogTitle>
          </DialogHeader>
          {showQR && (
            <div className="text-center space-y-4 py-2">
              {/* QR code rendered via Google Charts API */}
              <div className="bg-white p-4 rounded-xl inline-block shadow-md">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/attend/${showQR.qrToken}`)}`}
                  alt="QR Code"
                  className="w-48 h-48"
                />
              </div>
              <div>
                <p className="text-sm font-medium">{showQR.name}</p>
                {showQR.location && (
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" /> {showQR.location}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => copyQrLink(showQR.qrToken)}
                >
                  <Copy className="w-4 h-4" /> Copy Link
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => {
                    const url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(`${window.location.origin}/attend/${showQR.qrToken}`)}`;
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `qr-${showQR.name.replace(/\s+/g, "-")}.png`;
                    a.click();
                  }}
                >
                  <Download className="w-4 h-4" /> Download
                </Button>
              </div>
              <p className="text-xs text-muted-foreground break-all bg-muted rounded p-2">
                {window.location.origin}/attend/{showQR.qrToken}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
