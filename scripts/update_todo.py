#!/usr/bin/env python3
"""Mark all already-implemented items as done in todo.md"""
import re

with open('todo.md', 'r') as f:
    content = f.read()

# Items that are confirmed implemented in the codebase
implemented = [
    # No company guard
    'Add "no company" guard with CTA to create company',
    # Leave balance bar
    'Add leave balance summary bar (Annual / Sick / Emergency remaining days)',
    # Date range validation
    'Add date range validation (end date must be after start date)',
    # Quick-filter chips
    'Add quick-filter chips (All / Pending / In Progress / Completed) above the list',
    # Mark All Acknowledged
    'Add "Mark All as Acknowledged" bulk action button',
    # Company docs route
    'Route: /company/documents registered in App.tsx',
    'Nav: "Company Documents" added to My Company sidebar group',
    # Employee docs
    'DB: employee_documents table',
    'DB: Apply migration for both company_documents and employee_documents tables',
    'Frontend: EmployeeDocumentsPanel',
    'Frontend: Document types for employees: Work Permit, Visa, Passport, ROP Card, ID Card, Labour Card, Medical Certificate, Contract',
    'Frontend: Document types for company: CR Certificate, OCCI Membership, Municipality Licence, Trade Licence, Tax Card, Labour Card, PASI Certificate, Chamber Certificate',
    'Frontend: Expiry status colour coding',
    'Frontend: PDF/image viewer',
    'Route: /company/documents registered in App.tsx',
    'Nav: "Documents" added to My Company sidebar group',
    # Backend employee extensions
    'Backend: extend updateEmployee to accept phone, email, nationality, nationalId, passportNumber, hireDate, terminationDate, employeeNumber, workPermitNumber, visaNumber, occupationCode, occupationName',
    'Backend: extend createEmployee to accept all the same fields',
    # Payroll
    'Backend: Enhance createRun to auto-pickup active salary loans and deduct monthly amount',
    'Backend: Add generatePayslip procedure',
    'Backend: Add generateWPS procedure',
    'UI: PayrollProcessingPage.tsx',
    # Sidebar active state
    'Improve sidebar active-state to highlight parent when on child routes',
    # Loading skeleton
    'Add loading skeleton for KPI tiles while data loads',
    # Visual status timeline
    'Add visual status timeline on leave request cards',
    # Workflow progress bar
    'Make workflow progress bar responsive on mobile',
    # Severity badge
    'Fix severity badge colours to use brand palette (not blue)',
    # Contract type icon
    'Add contract type icon in the list view',
    # Plan comparison cards
    'Make plan comparison cards stack properly on mobile',
    # Unread badge
    'Replace hardcoded blue unread badge with brand orange',
    # Message count badge
    'Add message count badge on the Messages tab trigger',
    # Document viewer
    'Frontend: Document viewer',
    # MyTeam enhancements
    'UI: MyTeamPage add/edit wizard',
    'UI: MyTeamPage staff cards — add "View Profile" button linking to /business/employee/:id',
    'UI: MyTeamPage staff cards — add "Documents" button linking to /employee/:id/documents',
    'UI: MyTeamPage staff profile side panel — show work permit number, visa number, passport number, civil ID, nationality',
    'UI: EmployeeLifecyclePage — show work permit details (number, expiry, occupation, status) in Profile tab',
    'UI: EmployeeLifecyclePage — Documents tab links to /employee/:id/documents (not old workforce hub)',
    'UI: EmployeeLifecyclePage — capture termination date and reason when status set to terminated/resigned',
    'UI: EmployeeLifecyclePage — add "Edit Full Profile" button that opens expanded edit form',
    # Backend getEmployeeWithPermit
    'Backend: add getEmployeeWithPermit procedure',
    # Payroll UI tabs
    'UI: Run Payroll tab',
    'UI: Per-employee breakdown table',
    # Module cards live counts
    'Make module cards show live counts (employees, contracts, alerts)',
    # Avatar colour variety
    'Add avatar colour variety using department-based colour assignment',
    # Sticky table header
    'Add sticky table header in table view',
    # Copy email
    'Add "Copy email" quick action in staff card dropdown',
    # Add Staff wizard simplify
    'Simplify Add Staff wizard — reduce to 2 focused steps (Essential Info / Employment Details)',
    # PageHeader component
    'Add `PageHeader` reusable component with breadcrumb, title, subtitle, and action slot',
    # Empty state components
    'Improve empty state components — consistent icon + message + CTA pattern',
    # Loading skeleton
    'Add consistent page-level loading skeleton to all data-heavy pages',
    # Fix navy blue
    'Fix navy blue usage in OnboardingPage (replace with charcoal/gray)',
    # My Company group visibility
    'Add "My Company" group visibility rule — only show when user has a company workspace',
    # Backend previewRun
    'Backend: Add previewRun procedure',
    # Backend getEmployeePayrollHistory
    'Backend: Add getEmployeePayrollHistory procedure',
    # Convert create form to 2-step wizard
    'Convert create form to 2-step wizard (Basic Info / Terms & Dates)',
    # Payslips tab
    'UI: Payslips tab',
    # Salary Setup tab
    'UI: Salary Setup tab',
    # Loans tab
    'UI: Loans tab',
]

count = 0
for item in implemented:
    # Use partial match - find lines containing this text
    lines = content.split('\n')
    new_lines = []
    for line in lines:
        if line.startswith('- [ ] ') and item.split(' — ')[0].strip() in line:
            new_lines.append(line.replace('- [ ] ', '- [x] ', 1))
            count += 1
        else:
            new_lines.append(line)
    content = '\n'.join(new_lines)

with open('todo.md', 'w') as f:
    f.write(content)

print(f'Marked {count} items as done')
remaining = len([l for l in content.split('\n') if l.startswith('- [ ] ')])
print(f'Remaining uncompleted: {remaining}')
