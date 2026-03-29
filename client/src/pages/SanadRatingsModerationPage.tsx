import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Eye, EyeOff, MessageSquare, RefreshCw, Shield, Star, XCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Star Rating Display ──────────────────────────────────────────────────────

function StarDisplay({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          size={size}
          className={s <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}
        />
      ))}
    </div>
  );
}

// ─── Moderation Dialog ────────────────────────────────────────────────────────

function ModerationDialog({
  rating,
  onClose,
  onDone,
}: {
  rating: {
    id: number;
    overallRating: number;
    reviewTitle: string | null;
    reviewBody: string | null;
    reviewerName: string | null;
    companyName: string | null;
    officeName: string | null;
    isPublished: boolean;
    moderationNote: string | null;
  };
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState(rating.moderationNote ?? "");
  const moderate = trpc.ratings.moderateRating.useMutation({
    onSuccess: () => { toast.success("Rating moderated"); onDone(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Moderate Review</DialogTitle>
          <DialogDescription>Review from {rating.companyName} for {rating.officeName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StarDisplay rating={rating.overallRating} />
              <span className="text-sm font-medium">{rating.overallRating}/5</span>
            </div>
            {rating.reviewTitle && <p className="font-medium text-sm">{rating.reviewTitle}</p>}
            {rating.reviewBody && <p className="text-sm text-muted-foreground">{rating.reviewBody}</p>}
            <p className="text-xs text-muted-foreground">— {rating.reviewerName} ({rating.companyName})</p>
          </div>
          <div className="space-y-1">
            <Label>Moderation Note (optional)</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Reason for hiding or approving this review..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => moderate.mutate({ ratingId: rating.id, isPublished: false, moderationNote: note || undefined })}
            disabled={moderate.isPending}
          >
            <EyeOff className="h-4 w-4 mr-1" /> Hide Review
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={() => moderate.mutate({ ratingId: rating.id, isPublished: true, moderationNote: note || undefined })}
            disabled={moderate.isPending}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve & Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SanadRatingsModerationPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "published" | "hidden">("all");
  const [moderating, setModerating] = useState<null | {
    id: number; overallRating: number; reviewTitle: string | null; reviewBody: string | null;
    reviewerName: string | null; companyName: string | null; officeName: string | null;
    isPublished: boolean; moderationNote: string | null;
  }>(null);

  const utils = trpc.useUtils();

  const publishedOnly = filter === "published" ? true : filter === "hidden" ? false : undefined;

  const { data, isLoading } = trpc.ratings.listForModeration.useQuery({
    limit: 100,
    publishedOnly,
  });

  const handleRefresh = () => utils.ratings.listForModeration.invalidate();

  if (user?.role !== "admin") {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-medium">Admin Access Required</p>
          <p className="text-sm text-muted-foreground mt-1">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  const ratings = data?.ratings ?? [];
  const total = data?.total ?? 0;
  const published = ratings.filter(r => r.isPublished).length;
  const hidden = ratings.filter(r => !r.isPublished).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ratings Moderation</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review, approve, or hide customer reviews for Sanad centres.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Reviews</p>
            <p className="text-2xl font-bold text-blue-600">{isLoading ? "—" : total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Published</p>
            <p className="text-2xl font-bold text-green-600">{isLoading ? "—" : published}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Hidden</p>
            <p className="text-2xl font-bold text-red-600">{isLoading ? "—" : hidden}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter + Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">All Reviews</CardTitle>
              <CardDescription>Click "Moderate" to approve or hide any review.</CardDescription>
            </div>
            <Select value={filter} onValueChange={v => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reviews</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading reviews...</div>
          ) : !ratings.length ? (
            <div className="text-center py-12">
              <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium">No reviews yet</p>
              <p className="text-sm text-muted-foreground mt-1">Reviews submitted by companies will appear here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Centre</TableHead>
                  <TableHead>Company / Reviewer</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ratings.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-sm">{r.officeName ?? `Office #${r.officeId}`}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{r.companyName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{r.reviewerName ?? "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <StarDisplay rating={r.overallRating} />
                        <span className="text-xs text-muted-foreground">{r.overallRating}/5</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {r.reviewTitle && <p className="text-sm font-medium truncate">{r.reviewTitle}</p>}
                      {r.reviewBody && <p className="text-xs text-muted-foreground line-clamp-2">{r.reviewBody}</p>}
                      {!r.reviewTitle && !r.reviewBody && <span className="text-xs text-muted-foreground italic">No text</span>}
                    </TableCell>
                    <TableCell>
                      <Badge className={r.isPublished ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                        {r.isPublished ? <><Eye className="h-3 w-3 mr-1" />Published</> : <><EyeOff className="h-3 w-3 mr-1" />Hidden</>}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.isVerified
                        ? <Badge className="bg-blue-100 text-blue-700"><CheckCircle2 className="h-3 w-3 mr-1" />Verified</Badge>
                        : <span className="text-xs text-muted-foreground">Unverified</span>
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline" size="sm"
                        onClick={() => setModerating({
                          id: r.id,
                          overallRating: r.overallRating,
                          reviewTitle: r.reviewTitle ?? null,
                          reviewBody: r.reviewBody ?? null,
                          reviewerName: r.reviewerName ?? null,
                          companyName: r.companyName ?? null,
                          officeName: r.officeName ?? null,
                          isPublished: r.isPublished,
                          moderationNote: r.moderationNote ?? null,
                        })}
                      >
                        <Shield className="h-3.5 w-3.5 mr-1" /> Moderate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Moderation Dialog */}
      {moderating && (
        <ModerationDialog
          rating={moderating}
          onClose={() => setModerating(null)}
          onDone={handleRefresh}
        />
      )}
    </div>
  );
}
