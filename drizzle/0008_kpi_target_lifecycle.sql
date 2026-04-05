-- PR-5: KPI target lifecycle (draft → active → completed | archived | cancelled)
ALTER TABLE `kpi_targets`
ADD COLUMN `target_status` ENUM('draft', 'active', 'completed', 'archived', 'cancelled') NOT NULL DEFAULT 'active';
