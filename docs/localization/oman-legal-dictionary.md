# Oman Legal & Business Terminology Dictionary

**Version:** 1.0  
**Scope:** SmartPRO Business Services Hub — en-OM / ar-OM  
**Authority:** This document is the single source of truth for all user-facing terminology across the platform. All UI copy, document templates, email notifications, status labels, and validation messages must conform to the approved terms below.

---

## How to Use This Dictionary

Each entry contains:
- **Approved English term** (en-OM)
- **Approved Arabic term** (ar-OM)
- **Usage context** — when and where to apply the term
- **Forbidden alternatives** — terms that must not appear in user-facing copy
- **Notes** — legal basis, Oman-specific nuance, or formatting guidance

---

## 1. Entity & Party Types

| Approved English | Approved Arabic | Usage Context | Forbidden Alternatives |
|-----------------|-----------------|---------------|------------------------|
| **Establishment** | **منشأة** | Registered legal entity (company, firm, enterprise) in formal/legal contexts | "company" in legal documents, "business", "firm" |
| **Company** | **شركة** | Acceptable in general UI navigation and informal contexts only | "business" as a standalone noun |
| **Service Provider** | **مزود الخدمة** | Third-party PRO, officer, or marketplace vendor | "vendor", "supplier", "contractor" (unless in a contract context) |
| **Client** | **عميل** | The business entity purchasing services from SmartPRO | "customer" in compliance/legal/government flows |
| **Beneficiary** | **مستفيد** | Individual receiving a government service (visa, permit) | "customer", "client" in government-service contexts |
| **Employee** | **موظف** | Staff member on the payroll of a registered establishment | "worker", "staff member", "staff" in formal HR contexts |
| **Worker** | **عامل** | Manual/blue-collar labour in permit and Omanisation contexts | "employee" when referring to permit holders specifically |
| **PRO Officer** | **موظف العلاقات الحكومية** | Omani PRO assigned to handle government transactions | "officer", "agent", "representative" without the PRO qualifier |
| **Platform Administrator** | **مدير المنصة** | SmartPRO system-level admin role | "admin", "superuser", "platform admin" (lowercase) |
| **Company Administrator** | **مدير الشركة** | Tenant-level admin within a registered establishment | "company admin", "tenant admin" |

---

## 2. Documents & Registrations

| Approved English | Approved Arabic | Usage Context | Forbidden Alternatives |
|-----------------|-----------------|---------------|------------------------|
| **Commercial Registration** | **السجل التجاري** | The CR certificate issued by MOCIIP; always spell out in full on first use, abbreviate as "CR" thereafter | "business license", "business registration", "trade license" |
| **Labour Card** | **بطاقة العمل** | The individual work authorisation card issued by the Ministry of Labour | "work card", "labour permit card", "MOL card" |
| **Work Permit** | **تصريح العمل** | The permit document authorising a foreign national to work; distinct from Labour Card | "labour permit", "work authorisation", "work visa" |
| **Residence Visa** | **تأشيرة الإقامة** | The residency authorisation document | "residency", "visa" alone when context is ambiguous |
| **Visit Visa** | **تأشيرة الزيارة** | Short-stay visitor authorisation | "tourist visa" unless specifically for tourism |
| **Passport** | **جواز السفر** | Travel document | "ID", "travel document" in visa/permit contexts |
| **National ID** | **بطاقة الهوية الوطنية** | Omani civil ID card | "ID card", "civil card", "Oman ID" |
| **PASI Certificate** | **شهادة هيئة التقاعد والتأمينات الاجتماعية** | Social Insurance certificate; abbreviate as "PASI" after first use | "pension certificate", "social insurance card" |
| **OCCI Membership** | **عضوية غرفة تجارة وصناعة عُمان** | Chamber of Commerce certificate | "chamber certificate", "OCCI card" |
| **Contract** | **عقد** | Legally binding bilateral agreement | "agreement" when a formal contract is meant; use "Agreement" only for MOUs and framework documents |
| **Agreement** | **اتفاقية** | Framework or MOU-type document; less formal than a contract | "contract" when referring to an MOU |
| **Declaration** | **إقرار** | Unilateral formal statement by one party | "statement", "acknowledgement" in legal contexts |
| **Undertaking** | **تعهد** | Formal commitment to perform or refrain from an action | "promise", "commitment" in legal documents |
| **Power of Attorney** | **توكيل رسمي** | Legal authorisation to act on behalf of another | "POA", "proxy" in formal contexts |

---

## 3. Government Entities & Processes

| Approved English | Approved Arabic | Usage Context | Forbidden Alternatives |
|-----------------|-----------------|---------------|------------------------|
| **Ministry of Labour** | **وزارة العمل** | The Omani government ministry responsible for labour affairs; abbreviate as "MoL" | "MOL", "labor ministry" |
| **Ministry of Commerce, Industry and Investment Promotion** | **وزارة التجارة والصناعة وترويج الاستثمار** | CR-issuing authority; abbreviate as "MOCIIP" | "commerce ministry", "MOC" |
| **Public Authority for Social Insurance** | **هيئة الضمان الاجتماعي** | Social insurance authority; abbreviate as "PASI" | "pension authority", "social insurance" alone |
| **Ministry of Housing and Urban Planning** | **وزارة الإسكان والتخطيط العمراني** | For property-related compliance | "housing ministry" |
| **Royal Oman Police** | **شرطة عُمان السلطانية** | For visa and residency matters | "ROP", "police" alone in formal contexts |
| **Sanad Centre** | **مركز سند** | Government service delivery centre under MOCIIP | "Sanad office", "service centre" (use "Sanad Centre" consistently) |
| **Sanad Office** | **مكتب سند** | A SmartPRO-activated partner office linked to a Sanad Centre | "Sanad branch", "partner centre" |
| **Omanisation** | **التعمين** | The national policy of increasing Omani nationals in the workforce | "localisation", "nationalization", "Omanization" (use the official spelling with "s") |
| **Omanisation Quota** | **نسبة التعمين** | The required percentage of Omani nationals per sector | "localisation target", "Oman quota" |
| **Government Transaction** | **معاملة حكومية** | Any submission to a government authority | "government service", "official transaction" |
| **Application** | **طلب** | A formal submission to a government authority or internal approval queue | "request" when submitting to government; "request" is acceptable for internal HR flows |
| **Request** | **طلب** | An internal workflow item (leave, shift change, document) | "application" when the context is internal HR |

---

## 4. Workflow Statuses

All status labels must be consistent across every module. The approved set is:

| Status Key | Approved English | Approved Arabic | Usage Notes |
|------------|-----------------|-----------------|-------------|
| `draft` | **Draft** | **مسودة** | Document or request not yet submitted |
| `pending` | **Pending** | **قيد الانتظار** | Submitted, awaiting first action |
| `under_review` | **Under Review** | **قيد المراجعة** | In an approval or compliance review queue |
| `pending_signature` | **Pending Signature** | **بانتظار التوقيع** | Contract or declaration awaiting signature |
| `approved` | **Approved** | **معتمد** | Formally approved by an authorised party |
| `rejected` | **Rejected** | **مرفوض** | Formally declined with reason |
| `in_progress` | **Processing** | **جارٍ المعالجة** | Officer actively working on the item; **do not use "In progress"** |
| `submitted_to_authority` | **Submitted to Authority** | **مقدَّم للجهة المختصة** | Sent to a government authority |
| `awaiting_documents` | **Awaiting Documents** | **بانتظار المستندات** | Blocked pending document upload |
| `completed` | **Completed** | **مكتمل** | Fully resolved and closed |
| `cancelled` | **Cancelled** | **ملغى** | Withdrawn by the requester |
| `expired` | **Expired** | **منتهي الصلاحية** | Document or permit past its validity date |
| `renewal_due` | **Renewal Due** | **يستحق التجديد** | Within the renewal window |
| `on_hold` | **On Hold** | **موقوف مؤقتاً** | Suspended pending resolution of an issue |
| `suspended` | **Suspended** | **موقوف** | Administratively suspended (compliance) |
| `terminated` | **Terminated** | **منتهٍ** | Contract or engagement formally ended |
| `active` | **Active** | **نشط** | Currently valid and operational |
| `inactive` | **Inactive** | **غير نشط** | Not currently operational |

---

## 5. Actions & Buttons

| Approved English | Approved Arabic | Usage Context | Forbidden Alternatives |
|-----------------|-----------------|---------------|------------------------|
| **Submit Request** | **تقديم الطلب** | Submitting any form or application | "Send now", "Submit now", "Send request" |
| **Submit Application** | **تقديم الطلب** | Government or formal application submission | "Apply now", "Send application" |
| **Save Draft** | **حفظ كمسودة** | Saving without submitting | "Save", "Save for later" |
| **Send for Review** | **إرسال للمراجعة** | Moving to an approval queue | "Submit for review", "Send for approval" |
| **Approve** | **اعتماد** | Formal approval action | "Accept", "Confirm" in approval flows |
| **Reject** | **رفض** | Formal rejection action | "Decline", "Deny" |
| **Cancel Request** | **إلغاء الطلب** | Withdrawing a submitted request | "Delete", "Remove" |
| **Upload Document** | **رفع المستند** | File upload action | "Attach file", "Add document" |
| **Download** | **تنزيل** | Downloading a file | "Export" when the action is specifically a download |
| **Export Report** | **تصدير التقرير** | Generating a report file | "Download report" |
| **Assign Officer** | **تعيين موظف** | Assigning a PRO officer to a case | "Assign agent", "Assign representative" |
| **View Details** | **عرض التفاصيل** | Opening a detail view | "Details", "See more", "View more" |
| **Edit** | **تعديل** | Modifying an existing record | "Update", "Change" in button labels |
| **Delete** | **حذف** | Permanently removing a record | "Remove" in destructive action contexts |
| **Confirm** | **تأكيد** | Confirming a non-approval action (e.g., dialog) | "OK", "Yes", "Proceed" |
| **Close** | **إغلاق** | Closing a dialog or panel | "Dismiss", "Cancel" when the action is closing |
| **Back** | **رجوع** | Navigation back | "Go back", "Return" |
| **Next** | **التالي** | Wizard/stepper navigation | "Continue", "Proceed" |
| **Finish** | **إنهاء** | Completing a multi-step wizard | "Done", "Complete" |

---

## 6. Financial & Billing

| Approved English | Approved Arabic | Usage Context | Forbidden Alternatives |
|-----------------|-----------------|---------------|------------------------|
| **Invoice** | **فاتورة** | Formal billing document | "Bill", "receipt" (receipt is for payment confirmation) |
| **Receipt** | **إيصال** | Proof of payment | "Invoice" after payment |
| **Payment** | **دفعة** | A single payment transaction | "charge", "fee payment" |
| **Deposit** | **وديعة** | Advance payment held against future services | "advance", "prepayment" |
| **Refund** | **استرداد** | Return of funds | "reimbursement" in billing contexts |
| **Deduction** | **خصم** | Amount subtracted from payroll or invoice | "discount" when referring to a price reduction |
| **Discount** | **تخفيض** | Price reduction | "deduction" in pricing contexts |
| **Subscription** | **اشتراك** | Recurring service plan | "plan", "package" as standalone labels |
| **Balance** | **الرصيد** | Account balance | "credit", "amount" alone |
| **Outstanding Amount** | **المبلغ المستحق** | Unpaid balance due | "due amount", "pending payment" |
| **Payroll** | **كشف الرواتب** | Monthly salary processing | "salary run", "wages" in payroll module |
| **Salary** | **الراتب** | Individual employee remuneration | "wage", "pay" in formal HR contexts |
| **Allowance** | **بدل** | Additional pay component | "benefit", "extra pay" |
| **Deduction (payroll)** | **استقطاع** | Payroll deduction (PASI, tax) | "deduction" alone without context |

---

## 7. Compliance & Audit

| Approved English | Approved Arabic | Usage Context | Forbidden Alternatives |
|-----------------|-----------------|---------------|------------------------|
| **Compliance** | **الامتثال** | Adherence to regulatory requirements | "conformity", "regulatory compliance" |
| **Violation** | **مخالفة** | A breach of a regulatory requirement | "infraction", "breach", "non-compliance" in status labels |
| **Penalty** | **غرامة** | Financial or administrative sanction | "fine", "charge" in compliance contexts |
| **Audit Log** | **سجل المراجعة** | System record of all actions | "activity log", "event log", "history" |
| **Audit Trail** | **مسار المراجعة** | The complete sequence of recorded events | "audit history", "activity trail" |
| **Inspection** | **تفتيش** | Official regulatory inspection | "audit" when referring to a government inspection |
| **Suspension** | **إيقاف** | Administrative suspension of a permit or registration | "freeze", "block" |
| **Activation** | **تفعيل** | Bringing a centre or service online | "enable", "launch" in compliance contexts |
| **Renewal** | **تجديد** | Extending the validity of a document or permit | "extension", "refresh" |
| **Expiry** | **انتهاء الصلاحية** | The date a document ceases to be valid | "expiration", "end date" in document contexts |

---

## 8. HR & Workforce

| Approved English | Approved Arabic | Usage Context | Forbidden Alternatives |
|-----------------|-----------------|---------------|------------------------|
| **Leave Request** | **طلب إجازة** | Employee request for time off | "time-off request", "absence request" |
| **Annual Leave** | **إجازة سنوية** | Paid annual leave entitlement | "vacation", "holiday" in HR contexts |
| **Sick Leave** | **إجازة مرضية** | Medical leave | "medical leave" (use "Sick Leave" for consistency) |
| **Unpaid Leave** | **إجازة بدون راتب** | Leave without pay | "leave without pay", "LWP" |
| **Attendance** | **الحضور والانصراف** | Time and attendance tracking | "time tracking", "clock-in/out" |
| **Shift** | **وردية** | A scheduled work period | "schedule", "rota" in shift contexts |
| **Department** | **قسم** | Organisational unit | "division", "team" in org-chart contexts |
| **Position** | **المسمى الوظيفي** | Job title/role | "job title", "role" in HR contexts |
| **Recruitment** | **التوظيف** | Hiring process | "hiring", "staffing" |
| **Onboarding** | **الاستقبال الوظيفي** | New employee integration process | "induction", "orientation" |
| **Performance Review** | **تقييم الأداء** | Formal performance evaluation | "appraisal", "review" alone |
| **KPI** | **مؤشر الأداء الرئيسي** | Key Performance Indicator; spell out on first use | "metric", "target" alone |

---

## 9. Sanad & Government Services

| Approved English | Approved Arabic | Usage Context | Forbidden Alternatives |
|-----------------|-----------------|---------------|------------------------|
| **Sanad Centre** | **مركز سند** | The physical government service centre | "Sanad office" (reserve "office" for the SmartPRO partner entity) |
| **Sanad Office** | **مكتب سند** | A SmartPRO-activated partner linked to a Sanad Centre | "Sanad branch", "partner centre" |
| **Partner Status** | **حالة الشراكة** | The onboarding/activation state of a Sanad partner | "partnership status", "activation state" |
| **Activation Readiness** | **جاهزية التفعيل** | Pre-activation checklist completion | "readiness score", "onboarding status" |
| **Invite Link** | **رابط الدعوة** | The tokenised URL sent to a prospective Sanad partner | "invitation", "onboarding link" |
| **Service Catalogue** | **كتالوج الخدمات** | The list of services offered by a Sanad Office | "service list", "offerings" |
| **Government Service** | **خدمة حكومية** | A service delivered on behalf of a government authority | "official service", "public service" |
| **Transaction Volume** | **حجم المعاملات** | Number of government transactions processed | "transaction count", "volume" alone |

---

## 10. Forbidden Patterns (Global)

The following patterns must not appear anywhere in user-facing copy:

| Forbidden | Reason | Use Instead |
|-----------|--------|-------------|
| "Send now" | Startup/casual | "Submit Request" |
| "In progress" | Ambiguous; not institutional | "Processing" |
| "Something went wrong" | Generic; not actionable | "An error occurred. Please try again or contact support." |
| "Oops" | Casual | Remove entirely; use a formal error message |
| "Get started" | Marketing/startup | "Begin" or remove |
| "Let's go" | Casual | Remove entirely |
| "Business license" | Incorrect Oman term | "Commercial Registration" |
| "Labour permit" (mixed with "Work Permit") | Inconsistent | Use "Work Permit" for the permit document; "Labour Card" for the card |
| "labor_card" (US spelling in labels) | Inconsistent | "Labour Card" (British spelling, consistent with Oman official usage) |
| "Customers" (in government/compliance flows) | Wrong register | "Clients" or "Beneficiaries" depending on context |
| "Staff member" (in formal HR) | Informal | "Employee" |
| Mixed Arabic synonyms for the same object | Creates confusion | Use the single approved Arabic term per object |
| Emoji in formal/legal/compliance flows | Unprofessional | Remove entirely from admin, compliance, and legal surfaces |

---

*Last updated: April 2026. Review annually or when Oman regulatory terminology changes.*
