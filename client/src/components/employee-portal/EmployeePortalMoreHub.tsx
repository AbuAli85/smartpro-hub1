import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  badge?: number;
};

function HubSection({ title, items, setActiveTab }: { title: string; items: HubItem[]; setActiveTab: (tab: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">{title}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map(({ tab, label, Icon, badge }) => (
          <Button
            key={tab}
            variant="outline"
            className="relative h-auto min-h-[3.5rem] flex flex-row items-center justify-start gap-3 px-3 py-3 text-left font-normal touch-manipulation"
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
    { tab: "requests", label: "Requests", Icon: ArrowLeftRight, badge: pendingShiftRequests },
    { tab: "worklog", label: "Work log", Icon: Timer },
    { tab: "expenses", label: "Expenses", Icon: Wallet, badge: pendingExpenses },
  ];

  const hr: HubItem[] = [
    { tab: "leave", label: "Leave", Icon: Calendar, badge: pendingLeave },
    { tab: "payroll", label: "Payslips", Icon: DollarSign },
    { tab: "documents", label: "Documents", Icon: FileText, badge: expiringDocsCount },
  ];

  const performance: HubItem[] = [
    { tab: "kpi", label: "KPI", Icon: Target },
    { tab: "training", label: "Training", Icon: Award, badge: trainingAttentionCount },
    { tab: "reviews", label: "Reviews", Icon: Star },
  ];

  return (
    <div className="mt-4 space-y-4">
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tools</CardTitle>
          <p className="text-xs font-normal text-muted-foreground">Leave, payslips, documents, KPIs — same destinations as desktop.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <HubSection title="Work" items={work} setActiveTab={setActiveTab} />
          <div className="border-t border-border/50 pt-4">
            <HubSection title="HR & pay" items={hr} setActiveTab={setActiveTab} />
          </div>
          <div className="border-t border-border/50 pt-4">
            <HubSection title="Growth" items={performance} setActiveTab={setActiveTab} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
