import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { useState } from "react";
import { ShoppingBag, Search, Star, MapPin, Phone, Plus, CheckCircle2, MessageSquare } from "lucide-react";
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
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" onClick={() => onChange(star)}>
          <Star size={20} className={star <= value ? "text-amber-400 fill-amber-400" : "text-muted-foreground"} />
        </button>
      ))}
    </div>
  );
}

function ReviewDialog({ booking, onSuccess }: { booking: any; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");

  const submitReview = trpc.marketplace.submitReview.useMutation({
    onSuccess: () => {
      toast.success("Review submitted!");
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  if (booking.rating) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star key={s} size={13} className={s <= (booking.rating ?? 0) ? "text-amber-400 fill-amber-400" : "text-muted-foreground"} />
        ))}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-7">
          <MessageSquare size={12} /> Review
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rate this Service</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-sm mb-2 block">Your Rating</Label>
            <StarRating value={rating} onChange={setRating} />
          </div>
          <div>
            <Label className="text-sm mb-1 block">Review (optional)</Label>
            <Textarea
              placeholder="Share your experience..."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={3}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => submitReview.mutate({ bookingId: booking.id, rating, review: review || undefined })}
            disabled={submitReview.isPending}
          >
            {submitReview.isPending ? "Submitting..." : "Submit Review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BookingDialog({ provider, companyId, onSuccess }: { provider: any; companyId: number | null; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ notes: "", scheduledAt: "" });

  const createMutation = trpc.marketplace.createBooking.useMutation({
    onSuccess: (data) => {
      toast.success(`Booking confirmed: ${data.bookingNumber}`);
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" disabled={companyId == null} title={companyId == null ? "Select a company workspace first" : undefined}>
          <Plus size={14} /> Book
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book: {provider.businessName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Preferred Date & Time</Label>
            <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes / Requirements</Label>
            <Textarea placeholder="Describe your requirements..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>
          <Button className="w-full" disabled={createMutation.isPending || companyId == null}
            onClick={() => createMutation.mutate({
              companyId: companyId ?? undefined,
              providerId: provider.id,
              serviceId: provider.id,
              scheduledAt: form.scheduledAt || undefined,
              notes: form.notes || undefined,
            })}>
            {createMutation.isPending ? "Booking..." : "Confirm Booking"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MarketplacePage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const { activeCompanyId } = useActiveCompany();
  const { data: bookings, refetch } = trpc.marketplace.listBookings.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const { data: providers } = trpc.marketplace.listProviders.useQuery({
    search: search || undefined,
    category: category !== "all" ? category : undefined,
  });

  const { data: categories } = trpc.marketplace.categories.useQuery();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-[var(--smartpro-orange)] flex items-center justify-center shadow-sm">
              <ShoppingBag size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">Business Services Marketplace</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Verified PRO offices, legal firms, accounting bureaus, IT providers, and consultants across Oman & GCC
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Verified Providers</span>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Instant Booking</span>
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">OMR Pricing</span>
            <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Rated & Reviewed</span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse">Browse Providers</TabsTrigger>
          <TabsTrigger value="bookings">My Bookings ({bookings?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4">
          {/* Search & Filter */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search providers..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            {categories?.slice(0, 6).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(category === cat ? "all" : cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  category === cat
                    ? "bg-[var(--smartpro-orange)] text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Providers Grid */}
          {providers?.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <ShoppingBag size={40} className="mx-auto text-muted-foreground mb-3 opacity-40" />
                <h3 className="font-semibold mb-1">No providers found</h3>
                <p className="text-sm text-muted-foreground">Try adjusting your search or category filter.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers?.map((provider) => (
                <Card key={provider.id} className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                        {provider.businessName?.charAt(0)}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {provider.isVerified && (
                          <Badge className="bg-blue-50 text-blue-700 text-xs gap-1" variant="outline">
                            <CheckCircle2 size={10} /> Verified
                          </Badge>
                        )}
                        {provider.isFeatured && (
                          <Badge className="bg-amber-50 text-amber-700 text-xs" variant="outline">Featured</Badge>
                        )}
                      </div>
                    </div>
                    <h3 className="font-semibold text-sm">{provider.businessName}</h3>
                    <p className="text-xs text-[var(--smartpro-orange)] font-medium mt-0.5">{provider.category}</p>
                    {provider.description && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{provider.description}</p>
                    )}
                    <div className="mt-3 space-y-1">
                      {provider.city && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin size={11} /> {provider.city}
                        </div>
                      )}
                      {provider.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone size={11} /> {provider.phone}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t">
                      <div className="flex flex-wrap items-center gap-1">
                        <Star size={13} className="text-amber-400 fill-amber-400" />
                        <span className="text-xs font-medium">{provider.rating ? Number(provider.rating).toFixed(1) : "New"}</span>
                        {provider.reviewCount && provider.reviewCount > 0 && (
                          <span className="text-xs text-muted-foreground">({provider.reviewCount})</span>
                        )}
                      </div>
                      <BookingDialog provider={provider} companyId={activeCompanyId} onSuccess={refetch} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty state with CTA to register */}
          {providers?.length === 0 && !search && category === "all" && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-4">Be the first to list your services on the marketplace</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="bookings" className="space-y-4">
          {bookings?.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <ShoppingBag size={40} className="mx-auto text-muted-foreground mb-3 opacity-40" />
                <h3 className="font-semibold mb-1">No bookings yet</h3>
                <p className="text-sm text-muted-foreground">Browse providers and make your first booking.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Booking #</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Provider</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Scheduled</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Review</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings?.map((booking) => (
                      <tr key={booking.id} className="border-b hover:bg-muted/20">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{booking.bookingNumber}</td>
                        <td className="px-4 py-3 font-medium">Provider #{booking.providerId}</td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs ${
                            booking.status === "completed" ? "bg-green-100 text-green-700" :
                            booking.status === "confirmed" ? "bg-blue-100 text-blue-700" :
                            booking.status === "cancelled" ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700"
                          }`} variant="outline">
                            {booking.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {booking.scheduledAt ? fmtDateTime(booking.scheduledAt) : "TBD"}
                        </td>
                        <td className="px-4 py-3">
                          {booking.status === "completed"
                            ? <ReviewDialog booking={booking} onSuccess={refetch} />
                            : <span className="text-xs text-muted-foreground">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {fmtDate(booking.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
