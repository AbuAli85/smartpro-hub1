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
} from "lucide-react";

export interface EmployeePortalMoreHubProps {
  setActiveTab: (tab: string) => void;
  pendingLeave: number;
  expiringDocsCount: number;
  trainingAttentionCount: number;
  pendingExpenses: number;
}

export function EmployeePortalMoreHub({
  setActiveTab,
  pendingLeave,
  expiringDocsCount,
  trainingAttentionCount,
  pendingExpenses,
}: EmployeePortalMoreHubProps) {
  const items: {
    tab: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { tab: "leave", label: "Leave", Icon: Calendar, badge: pendingLeave },
    { tab: "payroll", label: "Payslips", Icon: DollarSign },
    { tab: "documents", label: "Documents", Icon: FileText, badge: expiringDocsCount },
    { tab: "kpi", label: "KPI", Icon: Target },
    { tab: "expenses", label: "Expenses", Icon: Wallet, badge: pendingExpenses },
    { tab: "worklog", label: "Work log", Icon: Timer },
    { tab: "training", label: "Training", Icon: Award, badge: trainingAttentionCount },
    { tab: "reviews", label: "Reviews", Icon: Star },
  ];

  return (
    <div className="mt-4 space-y-4">
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">More</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">Payroll, documents, and other tools.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map(({ tab, label, Icon, badge }) => (
              <Button
                key={tab}
                variant="outline"
                className="relative h-auto min-h-[3.25rem] flex flex-row items-center justify-start gap-2 px-3 py-2.5 text-left font-normal"
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
        </CardContent>
      </Card>
    </div>
  );
}
