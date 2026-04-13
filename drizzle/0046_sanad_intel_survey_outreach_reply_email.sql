-- Email provided by a centre via WhatsApp/survey outreach (e.g. reply with address only) before a dedicated office survey URL exists.
ALTER TABLE `sanad_intel_center_operations`
  ADD COLUMN `survey_outreach_reply_email` varchar(320) NULL AFTER `invite_accept_email`;
