import { useState } from "react";
import { useLocation } from "wouter";
import { UserPlus, DollarSign, FileText, Upload, X, Zap } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { shouldUsePreRegistrationShell } from "@shared/clientNav";

interface QuickAction {
  icon: React.ReactNode;
  label: string;
  href: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: <UserPlus size={16} />,
    label: "Add Employee",
    href: "/hr/employees",
    color: "bg-blue-500 hover:bg-blue-600",
  },
  {
    icon: <DollarSign size={16} />,
    label: "Run Payroll",
    href: "/payroll",
    color: "bg-emerald-500 hover:bg-emerald-600",
  },
  {
    icon: <FileText size={16} />,
    label: "Generate Letter",
    href: "/hr/letters",
    color: "bg-purple-500 hover:bg-purple-600",
  },
  {
    icon: <Upload size={16} />,
    label: "Upload Document",
    href: "/documents",
    color: "bg-amber-500 hover:bg-amber-600",
  },
];

export default function QuickActionsButton() {
  const [open, setOpen] = useState(false);
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { companies } = useActiveCompany();
  if (shouldUsePreRegistrationShell(user, { hasCompanyMembership: companies.length > 0 })) {
    return null;
  }
  /** Dense admin data surfaces already expose row actions; the FAB overlaps table controls. */
  if (location.startsWith("/admin/sanad")) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Action items */}
      {open && (
        <div className="flex flex-col items-end gap-2 mb-1">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.href}
              onClick={() => { navigate(action.href); setOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-full text-white text-sm font-medium shadow-lg transition-all ${action.color}`}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all text-white
          ${open ? "bg-gray-700 hover:bg-gray-800 rotate-45" : "bg-[var(--smartpro-orange)] hover:bg-orange-600"}`}
        title="Quick Actions"
      >
        {open ? <X size={20} /> : <Zap size={20} />}
      </button>
    </div>
  );
}
