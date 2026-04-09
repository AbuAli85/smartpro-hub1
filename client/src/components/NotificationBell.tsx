import { useState } from "react";
import { Bell, BellRing, CheckCheck, ExternalLink, AlertTriangle, Info, CheckCircle, XCircle, ArrowUpRight } from "lucide-react";
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
import { useActionQueue } from "@/hooks/useActionQueue";
import { queueStatusDescription, queueStatusHeadline } from "@/features/controlTower/actionQueueComputeStatus";
import type { ActionQueueItem } from "@/features/controlTower/actionQueueTypes";
import { countUrgentItemsForBell, shouldCompressBellActionList } from "@/features/controlTower/priorityEngine";

function ActionQueueRow(props: {
  a: ActionQueueItem;
  navigate: (path: string) => void;
  setOpen: (open: boolean) => void;
}) {
  const { a, navigate, setOpen } = props;
  return (
    <div className="flex items-start gap-2">
      <span
        className={`mt-0.5 shrink-0 h-2 w-2 rounded-full ${
          a.severity === "high" ? "bg-red-500" : a.severity === "medium" ? "bg-amber-500" : "bg-slate-400"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug line-clamp-2">{a.title}</p>
        <Button
          variant="link"
          className="h-auto p-0 text-[11px] gap-0.5"
          onClick={() => {
            navigate(a.href);
            setOpen(false);
          }}
        >
          {a.ctaLabel} <ArrowUpRight size={10} />
        </Button>
      </div>
    </div>
  );
}

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

  const {
    items: actionItems,
    isLoading: actionsLoading,
    status: queueStatus,
    scopeActive: queueScopeActive,
  } = useActionQueue({
    enabled: open && automationQueriesEnabled,
  });

  const compressBellQueue =
    actionItems.length > 0 && shouldCompressBellActionList(actionItems);
  const urgentBellCount = countUrgentItemsForBell(actionItems);

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
      <PopoverContent align="end" className="w-96 p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell size={16} />
            <span className="font-semibold text-sm">Inbox</span>
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

        {/* Action queue (same logic as Control Tower) */}
        {open && automationQueriesEnabled && (
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Action queue
            </p>
            {actionsLoading ? (
              <p className="text-xs text-muted-foreground">Loading actions…</p>
            ) : !queueScopeActive ? (
              <p className="text-xs text-muted-foreground">Select a company to load actions.</p>
            ) : queueStatus === "error" ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-100">{queueStatusHeadline("error")}</p>
                <p className="text-[11px] text-muted-foreground">{queueStatusDescription("error")}</p>
              </div>
            ) : queueStatus === "partial" ? (
              <div className="space-y-2">
                <p className="text-[11px] text-amber-800 dark:text-amber-200">{queueStatusDescription("partial")}</p>
                {compressBellQueue ? (
                  <div className="rounded-md border border-red-200/80 bg-red-50/60 dark:bg-red-950/25 px-3 py-2 space-y-1">
                    <p className="text-xs font-medium text-red-900 dark:text-red-100">
                      {urgentBellCount} urgent issues need attention
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={() => {
                        navigate("/control-tower");
                        setOpen(false);
                      }}
                    >
                      Open Control Tower <ArrowUpRight size={12} className="inline ml-0.5" />
                    </Button>
                  </div>
                ) : (
                  actionItems.slice(0, 5).map((a) => (
                    <ActionQueueRow key={a.id} a={a} navigate={navigate} setOpen={setOpen} />
                  ))
                )}
              </div>
            ) : queueStatus === "all_clear" ? (
              <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle size={14} />
                {queueStatusHeadline("all_clear")}
              </div>
            ) : queueStatus === "no_urgent_blockers" ? (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">{queueStatusDescription("no_urgent_blockers")}</p>
                {compressBellQueue ? (
                  <div className="rounded-md border border-red-200/80 bg-red-50/60 dark:bg-red-950/25 px-3 py-2 space-y-1">
                    <p className="text-xs font-medium text-red-900 dark:text-red-100">
                      {urgentBellCount} urgent issues need attention
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={() => {
                        navigate("/control-tower");
                        setOpen(false);
                      }}
                    >
                      Open Control Tower <ArrowUpRight size={12} className="inline ml-0.5" />
                    </Button>
                  </div>
                ) : (
                  actionItems.slice(0, 5).map((a) => (
                    <ActionQueueRow key={a.id} a={a} navigate={navigate} setOpen={setOpen} />
                  ))
                )}
              </div>
            ) : compressBellQueue ? (
              <div className="rounded-md border border-red-200/80 bg-red-50/60 dark:bg-red-950/25 px-3 py-2 space-y-1">
                <p className="text-xs font-medium text-red-900 dark:text-red-100">
                  {urgentBellCount} urgent issues need attention
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => {
                    navigate("/control-tower");
                    setOpen(false);
                  }}
                >
                  Open Control Tower <ArrowUpRight size={12} className="inline ml-0.5" />
                </Button>
              </div>
            ) : (
              <ul className="space-y-2">
                {actionItems.slice(0, 5).map((a) => (
                  <ActionQueueRow key={a.id} a={a} navigate={navigate} setOpen={setOpen} />
                ))}
              </ul>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 mt-2 text-xs text-muted-foreground"
              onClick={() => {
                navigate("/control-tower");
                setOpen(false);
              }}
            >
              View Control Tower
            </Button>
          </div>
        )}

        <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Notifications
        </p>

        {/* Notification list */}
        <ScrollArea className="max-h-[320px]">
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
        <Separator />
        <div className="px-4 py-2 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => {
              navigate("/control-tower");
              setOpen(false);
            }}
          >
            Open Control Tower →
          </Button>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground"
              onClick={() => {
                navigate("/hr/workforce-intelligence");
                setOpen(false);
              }}
            >
              Workforce Intelligence →
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
