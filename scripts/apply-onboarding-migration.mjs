import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('No DATABASE_URL found');
  process.exit(1);
}

const conn = await mysql.createConnection(url);

const statements = [
  `CREATE TABLE IF NOT EXISTS \`onboarding_steps\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY,
    \`step_key\` varchar(64) NOT NULL,
    \`category\` enum('profile','company','team','services','compliance','explore') NOT NULL,
    \`title_en\` varchar(256) NOT NULL,
    \`title_ar\` varchar(256),
    \`description_en\` text,
    \`description_ar\` text,
    \`action_label\` varchar(128),
    \`action_url\` varchar(256),
    \`icon_name\` varchar(64),
    \`sort_order\` int NOT NULL DEFAULT 0,
    \`is_required\` boolean NOT NULL DEFAULT true,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY \`uq_onboarding_step_key\` (\`step_key\`),
    INDEX \`idx_onboarding_steps_category\` (\`category\`)
  )`,

  `CREATE TABLE IF NOT EXISTS \`user_onboarding_progress\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY,
    \`user_id\` int NOT NULL,
    \`company_id\` int NOT NULL,
    \`step_key\` varchar(64) NOT NULL,
    \`status\` enum('pending','completed','skipped') NOT NULL DEFAULT 'pending',
    \`completed_at\` timestamp NULL,
    \`skipped_at\` timestamp NULL,
    \`auto_completed\` boolean NOT NULL DEFAULT false,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY \`uq_user_onboarding_user_company_step\` (\`user_id\`, \`company_id\`, \`step_key\`),
    INDEX \`idx_user_onboarding_user_company\` (\`user_id\`, \`company_id\`),
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
    FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE
  )`,

  `INSERT IGNORE INTO \`onboarding_steps\` (\`step_key\`, \`category\`, \`title_en\`, \`title_ar\`, \`description_en\`, \`description_ar\`, \`action_label\`, \`action_url\`, \`icon_name\`, \`sort_order\`, \`is_required\`) VALUES
  ('complete_profile', 'profile', 'Complete Your Profile', 'أكمل ملفك الشخصي', 'Add your name, phone number, and profile photo to personalise your account.', 'أضف اسمك ورقم هاتفك وصورة الملف الشخصي لتخصيص حسابك.', 'Go to Profile', '/preferences', 'User', 1, true),
  ('setup_company', 'company', 'Set Up Company Profile', 'إعداد ملف الشركة', 'Fill in your company details including CR number, PASI number, and Omanisation target.', 'أدخل تفاصيل شركتك بما في ذلك رقم السجل التجاري ورقم باسي وهدف العُمنة.', 'Company Settings', '/company-settings', 'Building2', 2, true),
  ('invite_team', 'team', 'Invite Your Team Members', 'دعوة أعضاء الفريق', 'Add colleagues to your workspace and assign them appropriate roles and permissions.', 'أضف زملاءك إلى مساحة العمل وامنحهم الأدوار والصلاحيات المناسبة.', 'Invite Members', '/admin/users', 'Users', 3, true),
  ('explore_dashboard', 'explore', 'Explore the Executive Dashboard', 'استكشف لوحة التحكم التنفيذية', 'Get familiar with the Executive Control Tower — your central hub for KPIs, alerts, and quick access.', 'تعرّف على برج المراقبة التنفيذي — مركزك الرئيسي للمؤشرات والتنبيهات والوصول السريع.', 'Go to Dashboard', '/dashboard', 'LayoutDashboard', 4, false),
  ('add_employee', 'team', 'Add Your First Employee', 'أضف أول موظف', 'Register an employee in the HR module to start managing your workforce.', 'سجّل موظفاً في وحدة الموارد البشرية لبدء إدارة قوتك العاملة.', 'Add Employee', '/hr/employees', 'UserPlus', 5, true),
  ('create_contract', 'services', 'Create Your First Contract', 'أنشئ أول عقد', 'Use the Smart Contracts module to draft, negotiate, and manage business agreements.', 'استخدم وحدة العقود الذكية لصياغة الاتفاقيات التجارية وإدارتها.', 'Create Contract', '/contracts', 'FileText', 6, false),
  ('submit_pro_service', 'services', 'Submit a PRO Service Request', 'تقديم طلب خدمة مندوب', 'Request visa processing, work permits, or other government services through the PRO module.', 'اطلب معالجة التأشيرات أو تصاريح العمل أو غيرها من الخدمات الحكومية عبر وحدة المندوب.', 'PRO Services', '/pro-services', 'Briefcase', 7, false),
  ('check_compliance', 'compliance', 'Review Compliance Status', 'مراجعة حالة الامتثال', 'Check your Omanisation ratio, document expiry alerts, and compliance certificates.', 'تحقق من نسبة العُمنة وتنبيهات انتهاء صلاحية الوثائق وشهادات الامتثال.', 'Compliance Centre', '/compliance', 'ShieldCheck', 8, false),
  ('explore_marketplace', 'explore', 'Explore the Service Marketplace', 'استكشف سوق الخدمات', 'Browse verified PRO service providers and book government services directly.', 'تصفح مزودي خدمات المندوب المعتمدين واحجز الخدمات الحكومية مباشرةً.', 'Open Marketplace', '/marketplace', 'Store', 9, false),
  ('setup_subscription', 'company', 'Choose a Subscription Plan', 'اختر خطة الاشتراك', 'Select the plan that fits your company size and unlock advanced platform features.', 'اختر الخطة التي تناسب حجم شركتك وافتح ميزات المنصة المتقدمة.', 'View Plans', '/subscription', 'CreditCard', 10, false)`,
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    console.log('✓ Statement executed successfully');
  } catch (err) {
    console.error('✗ Error:', err.message);
  }
}

await conn.end();
console.log('Migration complete.');
