-- Phase 40: Extended company profile fields
ALTER TABLE `companies`
  ADD COLUMN `crNumber` varchar(100),
  ADD COLUMN `occiNumber` varchar(100),
  ADD COLUMN `municipalityLicenceNumber` varchar(100),
  ADD COLUMN `laborCardNumber` varchar(100),
  ADD COLUMN `pasiNumber` varchar(100),
  ADD COLUMN `bankName` varchar(255),
  ADD COLUMN `bankAccountNumber` varchar(100),
  ADD COLUMN `bankIban` varchar(50),
  ADD COLUMN `omanisationTarget` decimal(5,2),
  ADD COLUMN `foundedYear` int,
  ADD COLUMN `description` text;

-- Phase 40: Extended employee fields
ALTER TABLE `employees`
  ADD COLUMN `dateOfBirth` date,
  ADD COLUMN `gender` enum('male','female'),
  ADD COLUMN `maritalStatus` enum('single','married','divorced','widowed'),
  ADD COLUMN `profession` varchar(150),
  ADD COLUMN `visaNumber` varchar(50),
  ADD COLUMN `visaExpiryDate` date,
  ADD COLUMN `workPermitNumber` varchar(50),
  ADD COLUMN `workPermitExpiryDate` date,
  ADD COLUMN `pasiNumber` varchar(50),
  ADD COLUMN `bankName` varchar(255),
  ADD COLUMN `bankAccountNumber` varchar(100),
  ADD COLUMN `emergencyContactName` varchar(255),
  ADD COLUMN `emergencyContactPhone` varchar(32);
