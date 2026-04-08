import { useState } from "react";
import { Bell, BellRing, CheckCheck, ExternalLink, AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";

const typeIcon = {
  info: <Info size={14} className="text-blue-500" />,
  warning: <AlertTriangle size={14} className="text-amber-500" />,
  error: <XCircle size={14} className="text-red-500" />,
  success: <CheckCircle size={14} className="text-green-500" />,
};

const typeBg = {
  info: "bg-blue-50 border-blue-100",
  warning: "bg-amber-50 border-amber-100",
  error: "bg-red-50 border-red-100",
  success: "bg-green-50 border-green-100",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { activeCompanyId, loading: companiesLoading } = useActiveCompany();
  const utils = trpc.useUtils();

  const automationQueriesEnabled =
    isAuthenticated && activeCompanyId != null && !companiesLoading;

  const { data: countData } = trpc.automation.getUnreadCount.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { refetchInterval: 30_000, enabled: automationQueriesEnabled },
  );

  const { data: notifications = [], isLoading } = trpc.automation.listNotifications.useQuery(
    { limit: 20, unreadOnly: false, companyId: activeCompanyId ?? undefined },
    { enabled: open && automationQueriesEnabled },
  );

  const markRead = trpc.automation.markNotificationsRead.useMutation({
    onSuccess: () => {
      utils.automation.getUnreadCount.invalidate();
      utils.automation.listNotifications.invalidate();
    },
  });

  const unreadCount = countData?.count ?? 0;

  const handleMarkAllRead = () => {
    markRead.mutate({ all: true, companyId: activeCompanyId ?? undefined });
  };

  const handleNotificationClick = (notif: typeof notifications[0]) => {
    if (notif.is_read === 0) {
      markRead.mutate({ ids: [notif.id], companyId: activeCompanyId ?? undefined });
    }
    if (notif.link) {
      navigate(notif.link);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          {unreadCount > 0 ? (
            <BellRing size={18} className="text-amber-500" />
          ) : (
            <Bell size={18} />
          )}
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] bg-red-500 text-white border-0 flex items-center justify-center"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell size={16} />
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs h-5 px-1.5">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={handleMarkAllRead}
              disabled={markRead.isPending}
            >
              <CheckCheck size={12} />
              Mark all read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <ScrollArea className="max-h-[360px]">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="py-10 text-center">
              <Bell size={28} className="mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Automation alerts will appear here
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notif) => {
                const type = (notif.type as keyof typeof typeIcon) || "info";
                const isUnread = notif.is_read === 0;
                return (
                  <button
                    key={notif.id}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${isUnread ? "bg-muted/20" : ""}`}
                    onClick={() => handleNotificationClick(notif)}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex-shrink-0">{typeIcon[type]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-xs font-medium truncate ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
                            {notif.title}
                          </p>
                          {isUnread && (
                            <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notif.message}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground/60">
                            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                          </span>
                          {notif.link && (
                            <span className="text-[10px] text-primary flex items-center gap-0.5">
                              View <ExternalLink size={9} />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="px-4 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs text-muted-foreground"
                onClick={() => { navigate("/hr/workforce-intelligence"); setOpen(false); }}
              >
                View all in Workforce Intelligence →
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
