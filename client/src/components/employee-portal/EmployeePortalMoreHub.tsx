import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  DollarSign,
  FileText,
  Target,
  Wallet,
  Timer,
  Award,
  Star,
  ChevronRight,
  ArrowLeftRight,
} from "lucide-react";

export interface EmployeePortalMoreHubProps {
  setActiveTab: (tab: string) => void;
  pendingLeave: number;
  expiringDocsCount: number;
  trainingAttentionCount: number;
  pendingExpenses: number;
  pendingShiftRequests: number;
}

type HubItem = {
  tab: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  badge?: number | null;
};

function HubSection({ title, items, setActiveTab }: { title: string; items: HubItem[]; setActiveTab: (tab: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2">
        {items.map(({ tab, label, Icon, badge }) => (
          <Button
            key={tab}
            variant="outline"
            className="relative flex h-auto min-h-[3.25rem] flex-row items-center justify-start gap-2.5 px-3 py-2.5 text-left text-sm font-normal touch-manipulation"
            onClick={() => setActiveTab(tab)}
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium leading-tight flex-1">{label}</span>
            {badge != null && badge > 0 && (
              <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                {badge > 9 ? "9+" : badge}
              </Badge>
            )}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-60" />
          </Button>
        ))}
      </div>
    </div>
  );
}

export function EmployeePortalMoreHub({
  setActiveTab,
  pendingLeave,
  expiringDocsCount,
  trainingAttentionCount,
  pendingExpenses,
  pendingShiftRequests,
}: EmployeePortalMoreHubProps) {
  const work: HubItem[] = [
    { tab: "requests", label: "Leave & HR Requests", Icon: ArrowLeftRight, badge: (pendingShiftRequests ?? 0) + (pendingLeave ?? 0) > 0 ? (pendingShiftRequests ?? 0) + (pendingLeave ?? 0) : undefined },
    { tab: "worklog", label: "Work Log", Icon: Timer },
    { tab: "expenses", label: "Expenses", Icon: Wallet, badge: pendingExpenses },
  ];

  const hr: HubItem[] = [
    { tab: "payroll", label: "Payslips", Icon: DollarSign },
    { tab: "documents", label: "My Documents", Icon: FileText, badge: expiringDocsCount },
    { tab: "attendance", label: "Attendance", Icon: Calendar },
  ];

  const growth: HubItem[] = [
    { tab: "kpi", label: "KPI & Targets", Icon: Target },
    { tab: "training", label: "Training", Icon: Award, badge: trainingAttentionCount },
    { tab: "reviews", label: "Self Reviews", Icon: Star },
  ];

  return (
    <div className="space-y-2">
      <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Self-Service</p>
      <Card className="border-border/60">
        <CardContent className="space-y-4 pb-4 pt-4">
          <HubSection title="Requests & Work" items={work} setActiveTab={setActiveTab} />
          <div className="border-t border-border/50 pt-4">
            <HubSection title="HR & Pay" items={hr} setActiveTab={setActiveTab} />
          </div>
          <div className="border-t border-border/50 pt-4">
            <HubSection title="Growth & Performance" items={growth} setActiveTab={setActiveTab} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
