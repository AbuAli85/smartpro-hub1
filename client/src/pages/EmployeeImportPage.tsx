import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import ExcelJS from "exceljs";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle,
  ArrowLeft, Download, Users, SkipForward, RefreshCw, Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  rowIndex: number;
  // Identity
  name: string;
  firstName: string; lastName: string;
  firstNameAr: string; lastNameAr: string;
  email: string; phone: string;
  nationality: string; civilNumber: string; passportNumber: string;
  gender: string; dateOfBirth: string; maritalStatus: string;
  // Employment
  department: string; position: string; profession: string;
  employmentType: string; employeeNumber: string;
  hireDate: string; salary: string; currency: string;
  // Permit / Visa
  visaNumber: string; occupationCode: string; occupationName: string; occupationNameAr: string;
  skillLevel: string; activityCode: string; activityNameEn: string; activityNameAr: string;
  workGovernorate: string; workWilayat: string; workArea: string;
  establishmentNameEn: string; establishmentNameAr: string; establishmentCrNumber: string; sponsorId: string;
  workPermitNumber: string; workPermitStatus: string;
  dateOfIssue: string; dateOfExpiry: string;
  visaExpiryDate: string; workPermitExpiryDate: string;
  transferred: string;
  // Additional
  pasiNumber: string; bankName: string; bankAccountNumber: string;
  emergencyContactName: string; emergencyContactPhone: string;
  // Validation
  valid: boolean;
  errors: string[];
}

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; name: string; reason: string }>;
  total: number;
}

// ─── Column mapping ───────────────────────────────────────────────────────────
// Maps normalized header → ParsedRow field

const COLUMN_MAP: Record<string, keyof ParsedRow> = {
  // Name
  "name": "name", "full name": "name", "employee name": "name",
  "first name": "firstName", "firstname": "firstName",
  "last name": "lastName", "lastname": "lastName", "surname": "lastName",
  "first name (ar)": "firstNameAr", "arabic first name": "firstNameAr",
  "last name (ar)": "lastNameAr", "arabic last name": "lastNameAr",
  // Contact
  "email": "email", "email address": "email",
  "phone": "phone", "mobile": "phone", "phone number": "phone", "mobile number": "phone",
  // Identity
  "nationality": "nationality",
  "civil number": "civilNumber", "civil no": "civilNumber", "civil id": "civilNumber",
  "civil id no": "civilNumber", "civil id number": "civilNumber", "civil id no.": "civilNumber",
  "id number": "civilNumber", "id no": "civilNumber", "id no.": "civilNumber", "personal number": "civilNumber",
  "worker id": "civilNumber", "worker civil id": "civilNumber", "identity number": "civilNumber",
  "national id": "civilNumber", "national id / civil id": "civilNumber",
  "passport": "passportNumber", "passport number": "passportNumber", "passport no": "passportNumber",
  "gender": "gender", "sex": "gender",
  "date of birth": "dateOfBirth", "dob": "dateOfBirth", "birth date": "dateOfBirth",
  "marital status": "maritalStatus",
  // Employment
  "department": "department", "dept": "department",
  "position": "position", "job title": "position", "title": "position",
  "profession": "profession",
  "employment type": "employmentType", "contract type": "employmentType",
  "employee number": "employeeNumber", "employee no": "employeeNumber", "emp no": "employeeNumber", "staff id": "employeeNumber",
  "hire date": "hireDate", "joining date": "hireDate", "start date": "hireDate",
  "salary": "salary", "basic salary": "salary", "monthly salary": "salary",
  "currency": "currency",
  // Work Permit
  "work permit number": "workPermitNumber", "work permit no": "workPermitNumber", "permit number": "workPermitNumber",
  "permit no": "workPermitNumber", "wp number": "workPermitNumber", "wp no": "workPermitNumber",
  "labour card no": "workPermitNumber", "labor card no": "workPermitNumber",
  "visa number": "visaNumber", "visa no": "visaNumber", "labour auth no": "visaNumber",
  "occupation code": "occupationCode",
  "occupation name": "occupationName", "occupation": "occupationName",
  "occupation name (ar)": "occupationNameAr", "occupation (ar)": "occupationNameAr",
  "occupation ar": "occupationNameAr", "arabic occupation": "occupationNameAr",
  "skill level": "skillLevel", "worker skill level": "skillLevel",
  "activity code": "activityCode", "establishment activity code": "activityCode",
  "activity name": "activityNameEn", "activity": "activityNameEn", "establishment activity": "activityNameEn",
  "activity name (ar)": "activityNameAr",
  "governorate": "workGovernorate", "work governorate": "workGovernorate",
  "wilayat": "workWilayat", "work wilayat": "workWilayat",
  "work area": "workArea", "work location area": "workArea", "location area": "workArea",
  "establishment name": "establishmentNameEn", "employer name": "establishmentNameEn",
  "company name (establishment)": "establishmentNameEn", "sponsor name": "establishmentNameEn",
  "establishment name (ar)": "establishmentNameAr", "employer name (ar)": "establishmentNameAr",
  "cr number": "establishmentCrNumber", "commercial registration": "establishmentCrNumber",
  "commercial reg": "establishmentCrNumber", "cr no": "establishmentCrNumber",
  "sponsor id": "sponsorId", "sponsor number": "sponsorId",
  "work permit status": "workPermitStatus", "permit status": "workPermitStatus",
  // Issue/expiry only — do NOT map "creation date" here (often empty and overwrote real issue date)
  "date of issue": "dateOfIssue", "issue date": "dateOfIssue",
  "date of expiry": "dateOfExpiry", "expiry date": "dateOfExpiry", "expiry": "dateOfExpiry",
  "visa expiry": "visaExpiryDate", "visa expiry date": "visaExpiryDate",
  "work permit expiry": "workPermitExpiryDate", "permit expiry": "workPermitExpiryDate",
  "transferred": "transferred",
  // Additional
  "pasi number": "pasiNumber", "pasi no": "pasiNumber",
  "bank name": "bankName",
  "bank account": "bankAccountNumber", "bank account number": "bankAccountNumber", "account number": "bankAccountNumber",
  "emergency contact": "emergencyContactName", "emergency contact name": "emergencyContactName",
  "emergency phone": "emergencyContactPhone", "emergency contact phone": "emergencyContactPhone",
};

/** Collapse whitespace so "Work  Permit   Number" matches "work permit number" */
function normalizeHeaderKey(key: string): string {
  return key.replace(/\s+/g, " ").toLowerCase().trim();
}

/** When MOL / bilingual exports use headers not listed in COLUMN_MAP */
function inferMappedFieldFromHeader(norm: string): keyof ParsedRow | undefined {
  const n = norm.replace(/\s+/g, " ").trim();
  if (/^nationality$/i.test(n) || /\bnationality\b/i.test(n)) return undefined;
  if (/\bcivil\b/i.test(n) || /\bnational\s+id\b/i.test(n) || /\bid\s+card\b/i.test(n) || /\bpersonal\s+(no|number|id)\b/i.test(n)) {
    return /passport/i.test(n) ? "passportNumber" : "civilNumber";
  }
  if (/\bpassport\b/i.test(n)) return "passportNumber";
  if (
    /\b(work\s*)?permit\b/i.test(n) &&
    /\b(no|number|#|رقم)\b/i.test(n) &&
    !/\bstatus|expiry|issue|date|type|class\b/i.test(n)
  ) {
    return "workPermitNumber";
  }
  if (/\b(labou?r|visa)\b/i.test(n) && /\b(auth|authorization|card)\b/i.test(n) && /\b(no|number)\b/i.test(n)) {
    return "visaNumber";
  }
  if (/\boccupation\b/i.test(n) && /\(ar\)|arabic|عربي|بالعربي/i.test(n)) return "occupationNameAr";
  if (/\boccupation\b/i.test(n) && !/\bcode\b/i.test(n)) return "occupationName";
  if (/\bgovernorate\b/i.test(n)) return "workGovernorate";
  if (/\bwilayat\b/i.test(n)) return "workWilayat";
  if (/\b(activity|establishment)\b/i.test(n) && /\bcode\b/i.test(n)) return "activityCode";
  if (/\bactivity\b/i.test(n) && !/\bcode\b/i.test(n)) return "activityNameEn";
  if (/\b(employer|establishment|sponsor)\b/i.test(n) && /\(ar\)|arabic/i.test(n)) return "establishmentNameAr";
  if (/\b(employer|establishment|sponsor)\b/i.test(n) && !/\(ar\)|arabic/i.test(n)) return "establishmentNameEn";
  return undefined;
}

/** Excel numbers (civil ID, permit no.) must become plain strings — no scientific notation for integers */
function excelScalarToString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return "";
    if (Number.isInteger(val) && Math.abs(val) < 1e15) return String(val);
    return String(val);
  }
  return String(val).trim();
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  let cur = "";
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      out.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsvRows(raw: string): Record<string, unknown>[] {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0] ?? "");
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i] ?? "");
    const row: Record<string, unknown> = {};
    let hasAny = false;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const value = cols[c] ?? "";
      if (value !== "") hasAny = true;
      row[key] = value;
    }
    if (hasAny) rows.push(row);
  }
  return rows;
}

function workbookCellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (rec.result !== undefined && rec.result !== null) return workbookCellToString(rec.result);
    if (typeof rec.text === "string") return rec.text.trim();
    if (Array.isArray(rec.richText)) {
      return rec.richText
        .map((part) =>
          typeof part === "object" && part !== null ? String((part as Record<string, unknown>).text ?? "") : "",
        )
        .join("")
        .trim();
    }
    if (typeof rec.hyperlink === "string") return rec.hyperlink.trim();
  }
  return excelScalarToString(value);
}

async function parseWorkbookRows(buffer: ArrayBuffer): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headerRow = ws.getRow(1);
  const headerCells = Math.max(headerRow.cellCount, headerRow.actualCellCount);
  const headers: string[] = [];
  for (let i = 1; i <= headerCells; i++) {
    headers.push(workbookCellToString(headerRow.getCell(i).value));
  }
  if (headers.every((h) => h.length === 0)) return [];

  const rows: Record<string, unknown>[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (row.cellCount === 0 && row.actualCellCount === 0) continue;
    const obj: Record<string, unknown> = {};
    let hasAny = false;
    for (let c = 1; c <= headers.length; c++) {
      const key = headers[c - 1];
      if (!key) continue;
      const value = workbookCellToString(row.getCell(c).value);
      if (value !== "") hasAny = true;
      obj[key] = value;
    }
    if (hasAny) rows.push(obj);
  }
  return rows;
}

function parseExcelFile(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const lowerName = file.name.toLowerCase();
        const rawRows =
          lowerName.endsWith(".csv")
            ? parseCsvRows(new TextDecoder("utf-8").decode(new Uint8Array(arrayBuffer)))
            : await parseWorkbookRows(arrayBuffer);

        if (rawRows.length === 0) { resolve([]); return; }

        const firstRow = rawRows[0];
        const headerMap: Record<string, keyof ParsedRow> = {};
        for (const key of Object.keys(firstRow)) {
          const norm = normalizeHeaderKey(key);
          const mapped = COLUMN_MAP[norm];
          if (mapped) headerMap[key] = mapped;
        }
        for (const key of Object.keys(firstRow)) {
          if (headerMap[key]) continue;
          const inferred = inferMappedFieldFromHeader(normalizeHeaderKey(key));
          if (inferred) headerMap[key] = inferred;
        }

        const parsed: ParsedRow[] = rawRows.map((row, idx) => {
          const r: ParsedRow = {
            rowIndex: idx + 2,
            name: "", firstName: "", lastName: "", firstNameAr: "", lastNameAr: "",
            email: "", phone: "", nationality: "", civilNumber: "", passportNumber: "",
            gender: "", dateOfBirth: "", maritalStatus: "",
            department: "", position: "", profession: "",
            employmentType: "", employeeNumber: "", hireDate: "", salary: "", currency: "",
            visaNumber: "", occupationCode: "", occupationName: "", occupationNameAr: "",
            skillLevel: "", activityCode: "", activityNameEn: "", activityNameAr: "",
            workGovernorate: "", workWilayat: "", workArea: "",
            establishmentNameEn: "", establishmentNameAr: "", establishmentCrNumber: "", sponsorId: "",
            workPermitNumber: "", workPermitStatus: "", dateOfIssue: "", dateOfExpiry: "",
            visaExpiryDate: "", workPermitExpiryDate: "", transferred: "",
            pasiNumber: "", bankName: "", bankAccountNumber: "",
            emergencyContactName: "", emergencyContactPhone: "",
            valid: true, errors: [],
          };

          for (const [key, field] of Object.entries(headerMap)) {
            const val = excelScalarToString(row[key]);
            (r as unknown as Record<string, unknown>)[field] = val;
          }

          // Auto-build name if firstName/lastName provided but name is empty
          if (!r.name && (r.firstName || r.lastName)) {
            r.name = [r.firstName, r.lastName].filter(Boolean).join(" ");
          }

          // Validation
          if (!r.name) {
            r.valid = false;
            r.errors.push("Employee name is required");
          }

          return r;
        });

        resolve(parsed);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function downloadTemplate() {
  const headers = [
    "Employee Name", "First Name", "Last Name",
    "First Name (AR)", "Last Name (AR)",
    "Email", "Phone", "Nationality", "Civil Number", "Passport Number",
    "Gender", "Date Of Birth", "Marital Status",
    "Department", "Position", "Profession", "Employment Type",
    "Employee Number", "Hire Date", "Salary", "Currency",
    "Work Permit Number", "Visa Number", "Occupation Code", "Occupation Name",
    "Work Permit Status", "Date Of Issue", "Date Of Expiry",
    "Visa Expiry Date", "Work Permit Expiry Date",
    "PASI Number", "Bank Name", "Bank Account Number",
    "Emergency Contact Name", "Emergency Contact Phone",
  ];
  const example = [
    "Ahmed Al-Rashidi", "Ahmed", "Al-Rashidi",
    "أحمد", "الراشدي",
    "ahmed@company.om", "+968 91234567", "Omani", "12345678", "A1234567",
    "Male", "1990-01-15", "Married",
    "Finance", "Accountant", "Accountant", "Full Time",
    "EMP-001", "2022-03-01", "600", "OMR",
    "WP/2024/12345", "V/2024/98765", "2411", "Accountant",
    "Active", "2022-03-01", "2025-03-01",
    "2025-06-01", "2025-03-01",
    "PASI-12345", "Bank Muscat", "0123456789",
    "Mohammed Al-Rashidi", "+968 99876543",
  ];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Employees");
  ws.addRow(headers);
  ws.addRow(example);
  ws.columns = headers.map(() => ({ width: 20 }));
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "SmartPRO_Employee_Import_Template.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if ((s.includes("active") || s.includes("valid")) && !s.includes("cancel")) {
    return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">Active</Badge>;
  }
  if (s.includes("cancel") || s.includes("expired")) {
    return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-xs">Ended</Badge>;
  }
  if (s.includes("deserted")) return <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30 text-xs">Deserted</Badge>;
  return <Badge variant="outline" className="text-xs">{status || "—"}</Badge>;
}

export default function EmployeeImportPage() {
  const [, navigate] = useLocation();
  const { activeCompanyId } = useActiveCompany();
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  /** When Civil ID or Passport matches someone already in My Team, merge file data (incl. work permits) instead of skipping. */
  const [updateExisting, setUpdateExisting] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bulkImport = trpc.team.bulkImport.useMutation({
    onSuccess: (data) => {
      setResult(data); setStep("result");
      const parts: string[] = [];
      if (data.imported > 0) parts.push(`${data.imported} new`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      if (parts.length > 0) toast.success(`${parts.join(", ")} — import finished`);
    },
    onError: (err) => toast.error(err.message ?? "Import failed"),
  });

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) { toast.error("Please upload an Excel (.xlsx, .xls) or CSV file"); return; }
    setFileName(file.name);
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) { toast.error("No data rows found in the file"); return; }
      setRows(parsed); setStep("preview");
    } catch { toast.error("Failed to read file. Please check the format."); }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = () => {
    const validRows = rows.filter((r) => r.valid);
    bulkImport.mutate({
      rows: validRows.map((r) => ({
        name: r.name,
        firstName: r.firstName || undefined, lastName: r.lastName || undefined,
        firstNameAr: r.firstNameAr || undefined, lastNameAr: r.lastNameAr || undefined,
        email: r.email || undefined, phone: r.phone || undefined,
        nationality: r.nationality || undefined,
        civilNumber: r.civilNumber || undefined, passportNumber: r.passportNumber || undefined,
        gender: r.gender || undefined, dateOfBirth: r.dateOfBirth || undefined,
        maritalStatus: r.maritalStatus || undefined,
        department: r.department || undefined, position: r.position || undefined,
        profession: r.profession || undefined, employmentType: r.employmentType || undefined,
        employeeNumber: r.employeeNumber || undefined, hireDate: r.hireDate || undefined,
        salary: r.salary || undefined, currency: r.currency || undefined,
        visaNumber: r.visaNumber || undefined, occupationCode: r.occupationCode || undefined,
        occupationName: r.occupationName || undefined, occupationNameAr: r.occupationNameAr || undefined,
        skillLevel: r.skillLevel || undefined, activityCode: r.activityCode || undefined,
        activityNameEn: r.activityNameEn || undefined, activityNameAr: r.activityNameAr || undefined,
        workLocationGovernorate: r.workGovernorate || undefined,
        workLocationWilayat: r.workWilayat || undefined,
        workLocationArea: r.workArea || undefined,
        establishmentNameEn: r.establishmentNameEn || undefined,
        establishmentNameAr: r.establishmentNameAr || undefined,
        establishmentCrNumber: r.establishmentCrNumber || undefined,
        sponsorId: r.sponsorId || undefined,
        workPermitNumber: r.workPermitNumber || undefined,
        workPermitStatus: r.workPermitStatus || undefined, dateOfIssue: r.dateOfIssue || undefined,
        dateOfExpiry: r.dateOfExpiry || undefined, visaExpiryDate: r.visaExpiryDate || undefined,
        workPermitExpiryDate: r.workPermitExpiryDate || undefined, transferred: r.transferred || undefined,
        pasiNumber: r.pasiNumber || undefined, bankName: r.bankName || undefined,
        bankAccountNumber: r.bankAccountNumber || undefined,
        emergencyContactName: r.emergencyContactName || undefined,
        emergencyContactPhone: r.emergencyContactPhone || undefined,
      })),
      skipDuplicates,
      updateExisting,
      companyId: activeCompanyId ?? undefined,
    });
  };

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.filter((r) => !r.valid).length;

  // ── Step: Upload ──────────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate("/my-team")}>
            <ArrowLeft size={18} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Import Employees</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Upload any employee spreadsheet — Work Permit Registry, HR master data, or custom format
            </p>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
            ${isDragging ? "border-[var(--smartpro-orange)] bg-orange-50 dark:bg-orange-950/20" : "border-border hover:border-[var(--smartpro-orange)] hover:bg-muted/30"}`}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <FileSpreadsheet size={28} className="text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Drop your Excel file here</p>
              <p className="text-sm text-muted-foreground mt-1">or click to browse — .xlsx, .xls, .csv supported</p>
            </div>
            <Button variant="outline" size="sm" className="mt-2 pointer-events-none">
              <Upload size={14} className="mr-2" /> Choose File
            </Button>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>

        {/* Template download */}
        <div className="mt-6 p-4 rounded-xl bg-muted/50 border border-border">
          <div className="flex items-start gap-3">
            <Info size={16} className="text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Download the template for best results</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The template includes all 35 supported columns: name, nationality, department, salary, work permit, visa, PASI, bank details, emergency contact, and more.
                Any column order is accepted — headers are matched automatically.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void downloadTemplate()} className="shrink-0">
              <Download size={13} className="mr-1.5" /> Template
            </Button>
          </div>
        </div>

        {/* Supported columns info */}
        <div className="mt-4 p-4 rounded-xl bg-card border border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Supported Column Groups</p>
          <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
            {[
              "Name (EN + AR)", "Email & Phone", "Nationality & ID", "Gender, DOB, Marital Status",
              "Department & Position", "Employment Type & Salary", "Work Permit & Visa", "Occupation Code/Name",
              "PASI & Bank Details", "Emergency Contact",
            ].map(g => (
              <div key={g} className="flex items-center gap-1.5">
                <CheckCircle2 size={11} className="text-emerald-500 shrink-0" /> {g}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Step: Preview ─────────────────────────────────────────────────────────────
  if (step === "preview") {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => { setStep("upload"); setRows([]); }}>
            <ArrowLeft size={18} />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">Preview Import</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{fileName}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm">
              <CheckCircle2 size={15} className="text-emerald-500" />
              <span className="font-semibold text-foreground">{validCount}</span>
              <span className="text-muted-foreground">valid</span>
            </div>
            {invalidCount > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                <XCircle size={15} className="text-red-500" />
                <span className="font-semibold text-foreground">{invalidCount}</span>
                <span className="text-muted-foreground">errors</span>
              </div>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-4 p-4 rounded-xl bg-muted/50 border border-border">
          <label className="flex items-start gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)}
              className="w-4 h-4 rounded mt-0.5 shrink-0" />
            <span>
              <span className="font-medium text-foreground">Update existing staff when Civil ID or Passport matches</span>
              <span className="block text-muted-foreground text-xs mt-0.5">
                Turn this on when you re-upload the same MOL / Excel file to fill or correct work permits and HR fields — existing people are merged, not skipped and not duplicated.
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)}
              className="w-4 h-4 rounded" />
            <span className="font-medium">Skip duplicates for new rows only</span>
            <span className="text-muted-foreground">(ignored when the row matches an existing person and update is on)</span>
          </label>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Nationality</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Civil ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Department</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Position</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Salary</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Work Permit</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Valid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rowIndex} className={`border-t border-border ${!r.valid ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                    <td className="px-3 py-2 text-muted-foreground">{r.rowIndex}</td>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {r.name || `${r.firstName} ${r.lastName}`.trim() || "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.nationality || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.civilNumber || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.department || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.position || r.occupationName || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.salary ? `${r.currency || "OMR"} ${r.salary}` : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.workPermitNumber || "—"}</td>
                    <td className="px-3 py-2"><StatusBadge status={r.workPermitStatus} /></td>
                    <td className="px-3 py-2">
                      {r.valid ? (
                        <CheckCircle2 size={14} className="text-emerald-500" />
                      ) : (
                        <div className="flex items-center gap-1">
                          <XCircle size={14} className="text-red-500" />
                          <span className="text-red-600 text-[10px]">{r.errors[0]}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-between items-center mt-4">
          <Button variant="outline" onClick={() => { setStep("upload"); setRows([]); }}>
            <RefreshCw size={14} className="mr-2" /> Re-upload
          </Button>
          <Button
            className="bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white"
            disabled={validCount === 0 || bulkImport.isPending}
            onClick={handleImport}
          >
            {bulkImport.isPending ? "Importing…" : `Import ${validCount} Employee${validCount !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Result ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4
          ${((result?.imported ?? 0) > 0 || (result?.updated ?? 0) > 0) ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
          {((result?.imported ?? 0) > 0 || (result?.updated ?? 0) > 0)
            ? <CheckCircle2 size={32} className="text-emerald-600" />
            : <AlertCircle size={32} className="text-amber-600" />}
        </div>
        <h2 className="text-2xl font-bold text-foreground">Import Complete</h2>
        <p className="text-muted-foreground mt-1">
          {result?.imported ?? 0} new · {result?.updated ?? 0} updated · {result?.skipped ?? 0} skipped · {result?.errors.length ?? 0} failed
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "New", value: result?.imported ?? 0, color: "text-emerald-600", icon: <CheckCircle2 size={18} /> },
          { label: "Updated", value: result?.updated ?? 0, color: "text-blue-600", icon: <RefreshCw size={18} /> },
          { label: "Skipped", value: result?.skipped ?? 0, color: "text-amber-600", icon: <SkipForward size={18} /> },
          { label: "Failed", value: result?.errors.length ?? 0, color: "text-red-600", icon: <XCircle size={18} /> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="p-4 rounded-xl border border-border bg-card text-center">
            <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {result && result.errors.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 overflow-hidden mb-6">
          <div className="px-4 py-2 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Failed Rows</p>
          </div>
          <div className="divide-y divide-border">
            {result.errors.map((e) => (
              <div key={e.row} className="px-4 py-2 flex items-start gap-3">
                <XCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs font-medium text-foreground">Row {e.row}: {e.name}</span>
                  <p className="text-xs text-muted-foreground">{e.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => { setStep("upload"); setRows([]); setResult(null); }}>
          <Upload size={14} className="mr-2" /> Import More
        </Button>
        <Button className="flex-1 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white" onClick={() => navigate("/my-team")}>
          <Users size={14} className="mr-2" /> View Team
        </Button>
      </div>
    </div>
  );
}
