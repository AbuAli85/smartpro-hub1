import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Download,
  Users,
  SkipForward,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  rowIndex: number;
  name: string;
  civilNumber: string;
  passportNumber: string;
  visaNumber: string;
  occupationCode: string;
  occupationName: string;
  workPermitNumber: string;
  workPermitStatus: string;
  dateOfIssue: string;
  dateOfExpiry: string;
  transferred: string;
  // validation
  valid: boolean;
  errors: string[];
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; name: string; reason: string }>;
  total: number;
}

// ─── Column mapping for the Work Permit Registry format ──────────────────────
// Supports both the exact column headers from the uploaded file and common variants

const COLUMN_MAP: Record<string, keyof ParsedRow> = {
  "work permit number": "workPermitNumber",
  "work permit no": "workPermitNumber",
  "permit number": "workPermitNumber",
  "civil number": "civilNumber",
  "civil no": "civilNumber",
  "civil id": "civilNumber",
  "employee name": "name",
  name: "name",
  "full name": "name",
  passport: "passportNumber",
  "passport number": "passportNumber",
  "passport no": "passportNumber",
  "visa number": "visaNumber",
  "visa no": "visaNumber",
  "occupation code": "occupationCode",
  "occupation name": "occupationName",
  occupation: "occupationName",
  position: "occupationName",
  "date of issue": "dateOfIssue",
  "issue date": "dateOfIssue",
  "date of expiry": "dateOfExpiry",
  "expiry date": "dateOfExpiry",
  "expiry": "dateOfExpiry",
  "creation date": "dateOfIssue",
  transferred: "transferred",
  "work permit status": "workPermitStatus",
  status: "workPermitStatus",
};

function parseExcelFile(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
          defval: "",
          raw: false,
        });

        if (rawRows.length === 0) {
          resolve([]);
          return;
        }

        // Build a normalised column map from the actual headers
        const firstRow = rawRows[0];
        const headerMap: Record<string, keyof ParsedRow> = {};
        for (const key of Object.keys(firstRow)) {
          const norm = key.toLowerCase().trim();
          const mapped = COLUMN_MAP[norm];
          if (mapped) headerMap[key] = mapped;
        }

        const parsed: ParsedRow[] = rawRows.map((row, idx) => {
          const r: ParsedRow = {
            rowIndex: idx + 2, // Excel row number (1 = header)
            name: "",
            civilNumber: "",
            passportNumber: "",
            visaNumber: "",
            occupationCode: "",
            occupationName: "",
            workPermitNumber: "",
            workPermitStatus: "",
            dateOfIssue: "",
            dateOfExpiry: "",
            transferred: "",
            valid: true,
            errors: [],
          };

          for (const [key, field] of Object.entries(headerMap)) {
            const val = String(row[key] ?? "").trim();
            (r as unknown as Record<string, unknown>)[field] = val;
          }

          // Validation
          if (!r.name) {
            r.valid = false;
            r.errors.push("Employee name is required");
          }

          return r;
        });

        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function downloadTemplate() {
  const headers = [
    "Work Permit Number",
    "Civil Number",
    "Employee Name",
    "Passport",
    "Visa Number",
    "Occupation Code",
    "Occupation Name",
    "Date Of Issue",
    "Date Of Expiry",
    "Creation Date",
    "Transferred",
    "Work Permit Status",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, "SmartPRO_Employee_Import_Template.xlsx");
}

// ─── Status badge helper ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "active")
    return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">Active</Badge>;
  if (s === "cancelled" || s === "expired")
    return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-xs">Cancelled</Badge>;
  if (s === "deserted")
    return <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30 text-xs">Deserted</Badge>;
  return <Badge variant="outline" className="text-xs">{status || "—"}</Badge>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmployeeImportPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bulkImport = trpc.team.bulkImport.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setStep("result");
      if (data.imported > 0) {
        toast.success(`${data.imported} employee${data.imported !== 1 ? "s" : ""} imported successfully`);
      }
    },
    onError: (err) => {
      toast.error(err.message ?? "Import failed");
    },
  });

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Please upload an Excel (.xlsx, .xls) or CSV file");
      return;
    }
    setFileName(file.name);
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) {
        toast.error("No data rows found in the file");
        return;
      }
      setRows(parsed);
      setStep("preview");
    } catch {
      toast.error("Failed to read file. Please check the format.");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleImport = () => {
    const validRows = rows.filter((r) => r.valid);
    bulkImport.mutate({
      rows: validRows.map((r) => ({
        name: r.name,
        civilNumber: r.civilNumber || undefined,
        passportNumber: r.passportNumber || undefined,
        visaNumber: r.visaNumber || undefined,
        occupationCode: r.occupationCode || undefined,
        occupationName: r.occupationName || undefined,
        workPermitNumber: r.workPermitNumber || undefined,
        workPermitStatus: r.workPermitStatus || undefined,
        dateOfIssue: r.dateOfIssue || undefined,
        dateOfExpiry: r.dateOfExpiry || undefined,
        transferred: r.transferred || undefined,
      })),
      skipDuplicates,
    });
  };

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.filter((r) => !r.valid).length;

  // ── Step: Upload ────────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate("/my-team")}>
            <ArrowLeft size={18} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Import Employees</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Upload your Work Permit Registry or any employee spreadsheet to add staff in bulk
            </p>
          </div>
        </div>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
            isDragging
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "border-border hover:border-primary/50 hover:bg-muted/30"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet size={32} className="text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold">Drop your Excel file here</p>
              <p className="text-muted-foreground text-sm mt-1">
                or click to browse — supports .xlsx, .xls, .csv
              </p>
            </div>
            <Button variant="outline" className="mt-2 gap-2">
              <Upload size={16} />
              Choose File
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>

        {/* Supported columns */}
        <div className="mt-8 rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-500" />
            Automatically recognised columns
          </p>
          <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
            {[
              "Work Permit Number", "Civil Number", "Employee Name",
              "Passport", "Visa Number", "Occupation Code",
              "Occupation Name", "Date Of Issue", "Date Of Expiry",
              "Work Permit Status", "Transferred", "Creation Date",
            ].map((col) => (
              <div key={col} className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                {col}
              </div>
            ))}
          </div>
        </div>

        {/* Download template */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium">Need a template?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Download a blank Excel file with the correct headers</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={downloadTemplate}>
            <Download size={14} />
            Template
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Preview ───────────────────────────────────────────────────────────
  if (step === "preview") {
    return (
      <div className="px-4 py-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setStep("upload")}>
              <ArrowLeft size={18} />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Preview Import</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                <span className="font-medium text-foreground">{fileName}</span> — {rows.length} rows detected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setStep("upload")} className="gap-2">
              <Upload size={14} />
              Change File
            </Button>
            <Button
              onClick={handleImport}
              disabled={validCount === 0 || bulkImport.isPending}
              className="gap-2"
            >
              {bulkImport.isPending ? (
                <><RefreshCw size={14} className="animate-spin" /> Importing…</>
              ) : (
                <><Users size={14} /> Import {validCount} Employee{validCount !== 1 ? "s" : ""}</>
              )}
            </Button>
          </div>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{rows.length}</p>
              <p className="text-xs text-muted-foreground">Total Rows</p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 size={18} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{validCount}</p>
              <p className="text-xs text-muted-foreground">Ready to Import</p>
            </div>
          </div>
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${invalidCount > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-card"}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${invalidCount > 0 ? "bg-red-500/15" : "bg-muted"}`}>
              <XCircle size={18} className={invalidCount > 0 ? "text-red-600" : "text-muted-foreground"} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${invalidCount > 0 ? "text-red-600" : ""}`}>{invalidCount}</p>
              <p className="text-xs text-muted-foreground">Validation Errors</p>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="mb-4 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
              className="rounded"
            />
            <span>Skip duplicates (same Civil ID or Passport already in system)</span>
          </label>
        </div>

        {/* Preview table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-3 text-left font-semibold text-muted-foreground w-8">#</th>
                  <th className="px-3 py-3 text-left font-semibold">Employee Name</th>
                  <th className="px-3 py-3 text-left font-semibold">Civil Number</th>
                  <th className="px-3 py-3 text-left font-semibold">Passport</th>
                  <th className="px-3 py-3 text-left font-semibold">Occupation</th>
                  <th className="px-3 py-3 text-left font-semibold">Work Permit</th>
                  <th className="px-3 py-3 text-left font-semibold">Issue Date</th>
                  <th className="px-3 py-3 text-left font-semibold">Expiry Date</th>
                  <th className="px-3 py-3 text-left font-semibold">Status</th>
                  <th className="px-3 py-3 text-left font-semibold w-20">Valid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-border last:border-0 transition-colors ${
                      !row.valid ? "bg-red-500/5" : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{row.rowIndex}</td>
                    <td className="px-3 py-2.5 font-medium capitalize">
                      {row.name || <span className="text-red-500 italic">Missing</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.civilNumber || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground uppercase">{row.passportNumber || "—"}</td>
                    <td className="px-3 py-2.5 text-xs capitalize">{row.occupationName || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.workPermitNumber || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.dateOfIssue || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.dateOfExpiry || "—"}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={row.workPermitStatus} />
                    </td>
                    <td className="px-3 py-2.5">
                      {row.valid ? (
                        <CheckCircle2 size={16} className="text-emerald-500" />
                      ) : (
                        <div className="flex items-center gap-1">
                          <XCircle size={16} className="text-red-500" />
                          <span className="text-xs text-red-500">{row.errors[0]}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {invalidCount > 0 && (
              <span className="text-red-500 font-medium">{invalidCount} row{invalidCount !== 1 ? "s" : ""} with errors will be skipped. </span>
            )}
            {validCount} employee{validCount !== 1 ? "s" : ""} will be imported.
          </p>
          <Button
            onClick={handleImport}
            disabled={validCount === 0 || bulkImport.isPending}
            size="lg"
            className="gap-2"
          >
            {bulkImport.isPending ? (
              <><RefreshCw size={16} className="animate-spin" /> Importing…</>
            ) : (
              <>Import {validCount} Employee{validCount !== 1 ? "s" : ""} <ChevronRight size={16} /></>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Result ────────────────────────────────────────────────────────────
  if (step === "result" && result) {
    const success = result.imported > 0;
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        {/* Icon */}
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${success ? "bg-emerald-500/15" : "bg-muted"}`}>
          {success ? (
            <CheckCircle2 size={40} className="text-emerald-500" />
          ) : (
            <AlertCircle size={40} className="text-muted-foreground" />
          )}
        </div>

        <h2 className="text-2xl font-bold mb-2">
          {success ? "Import Complete!" : "Nothing Imported"}
        </h2>
        <p className="text-muted-foreground mb-8">
          {success
            ? `${result.imported} employee${result.imported !== 1 ? "s" : ""} have been added to your team.`
            : "No new employees were added. All rows may have been duplicates or had errors."}
        </p>

        {/* Result stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-3xl font-bold text-emerald-600">{result.imported}</p>
            <p className="text-xs text-muted-foreground mt-1">Imported</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-3xl font-bold text-muted-foreground">{result.skipped}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <SkipForward size={11} /> Skipped
            </p>
          </div>
          <div className={`rounded-xl border p-4 ${result.errors.length > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-card"}`}>
            <p className={`text-3xl font-bold ${result.errors.length > 0 ? "text-red-600" : "text-muted-foreground"}`}>
              {result.errors.length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Errors</p>
          </div>
        </div>

        {/* Error details */}
        {result.errors.length > 0 && (
          <div className="text-left rounded-xl border border-red-500/30 bg-red-500/5 p-4 mb-6">
            <p className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-2">
              <AlertCircle size={14} /> Import Errors
            </p>
            <div className="space-y-2">
              {result.errors.map((err, i) => (
                <div key={i} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Row {err.row} — {err.name}:</span> {err.reason}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => navigate("/my-team")} className="gap-2">
            <Users size={16} />
            View My Team
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setStep("upload");
              setRows([]);
              setResult(null);
              setFileName("");
            }}
            className="gap-2"
          >
            <Upload size={16} />
            Import Another File
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
