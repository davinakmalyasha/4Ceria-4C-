
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `admin`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `nama` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `admin_user_id_foreign` (`user_id`),
  CONSTRAINT `admin_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `arsitek_ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `arsitek_ratings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `reviewer_id` bigint unsigned NOT NULL,
  `arsitek_id` bigint unsigned NOT NULL,
  `rating` int NOT NULL,
  `komentar` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `arsitek_ratings_project_id_foreign` (`project_id`),
  KEY `arsitek_ratings_reviewer_id_foreign` (`reviewer_id`),
  KEY `arsitek_ratings_arsitek_id_foreign` (`arsitek_id`),
  CONSTRAINT `arsitek_ratings_arsitek_id_foreign` FOREIGN KEY (`arsitek_id`) REFERENCES `arsiteks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `arsitek_ratings_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `arsitek_ratings_reviewer_id_foreign` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900070041 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `arsiteks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `arsiteks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `nama` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `no_telp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rate_harga` decimal(15,2) NOT NULL DEFAULT '0.00',
  `spesialisasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deskripsi` text COLLATE utf8mb4_unicode_ci,
  `lokasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pengalaman_tahun` int NOT NULL DEFAULT '0',
  `file_portofolio` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_sertifikat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pendidikan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alasan_hire` text COLLATE utf8mb4_unicode_ci,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identity_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` enum('individual','company') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'individual',
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_license` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reliability_score` int NOT NULL DEFAULT '100',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `arsiteks_user_id_foreign` (`user_id`),
  CONSTRAINT `arsiteks_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900033635 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bid_negotiation_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bid_negotiation_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `bid_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bid_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `round_number` int NOT NULL,
  `snapshot` json NOT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `changes_detected` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bid_negotiation_logs_bid_type_bid_id_index` (`bid_type`,`bid_id`),
  KEY `bid_negotiation_logs_user_id_foreign` (`user_id`),
  KEY `bid_negotiation_logs_bid_id_bid_type_round_number_index` (`bid_id`,`bid_type`,`round_number`),
  CONSTRAINT `bid_negotiation_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1890 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_arsitek`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_arsitek` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `arsitek_id` bigint unsigned DEFAULT NULL,
  `price` decimal(24,2) NOT NULL DEFAULT '0.00',
  `price_max` decimal(24,2) DEFAULT NULL,
  `negotiation_count` int NOT NULL DEFAULT '0',
  `fee_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed',
  `unit_price` decimal(24,2) DEFAULT NULL,
  `quantity` decimal(24,2) DEFAULT NULL,
  `calculated_total` decimal(24,2) DEFAULT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','shortlisted','invited','negotiating','contract_pending','awaiting_payment','accepted','active','rejected','declined','terminated','resigned','recommended') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `is_recommended` tinyint(1) NOT NULL DEFAULT '0',
  `estimated_duration` int DEFAULT NULL,
  `duration_unit` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `paid_at` timestamp NULL DEFAULT NULL,
  `scopes` json DEFAULT NULL,
  `deliverables` json DEFAULT NULL,
  `style` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `offered_by_id` bigint unsigned DEFAULT NULL,
  `fee_agreed_at` timestamp NULL DEFAULT NULL,
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `proposed_termins` json DEFAULT NULL,
  `proposed_milestones` json DEFAULT NULL,
  `proposed_team` json DEFAULT NULL,
  `refunded_amount` decimal(24,2) NOT NULL DEFAULT '0.00' COMMENT 'Portion of this payment returned via dispute arbitration',
  PRIMARY KEY (`id`),
  UNIQUE KEY `bids_arsitek_project_arsitek_unique` (`project_id`,`arsitek_id`),
  KEY `bids_arsitek_offered_by_id_foreign` (`offered_by_id`),
  KEY `bids_arsitek_project_id_status_index` (`project_id`,`status`),
  KEY `bids_arsitek_arsitek_id_index` (`arsitek_id`),
  KEY `bids_arsitek_arsitek_created_idx` (`arsitek_id`,`created_at`),
  KEY `bids_arsitek_payment_status_idx` (`payment_status`),
  CONSTRAINT `bids_arsitek_arsitek_id_foreign` FOREIGN KEY (`arsitek_id`) REFERENCES `arsiteks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_arsitek_offered_by_id_foreign` FOREIGN KEY (`offered_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bids_arsitek_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900110740 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_interior`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_interior` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `interior_id` bigint unsigned NOT NULL,
  `price` decimal(24,2) NOT NULL,
  `price_max` decimal(24,2) DEFAULT NULL,
  `negotiation_count` int NOT NULL DEFAULT '0',
  `fee_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed',
  `unit_price` decimal(24,2) DEFAULT NULL,
  `quantity` decimal(24,2) DEFAULT NULL,
  `calculated_total` decimal(24,2) DEFAULT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci,
  `scopes` json DEFAULT NULL,
  `deliverables` json DEFAULT NULL,
  `style` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','shortlisted','invited','negotiating','contract_pending','awaiting_payment','accepted','active','rejected','declined','terminated','resigned','recommended') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `is_recommended` tinyint(1) NOT NULL DEFAULT '0',
  `estimated_duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration_unit` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `paid_at` timestamp NULL DEFAULT NULL,
  `attachment_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `offered_by_id` bigint unsigned DEFAULT NULL,
  `fee_agreed_at` timestamp NULL DEFAULT NULL,
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `proposed_termins` json DEFAULT NULL,
  `proposed_milestones` json DEFAULT NULL,
  `refunded_amount` decimal(24,2) NOT NULL DEFAULT '0.00' COMMENT 'Portion of this payment returned via dispute arbitration',
  PRIMARY KEY (`id`),
  UNIQUE KEY `bids_interior_project_interior_unique` (`project_id`,`interior_id`),
  KEY `bids_interior_project_id_status_index` (`project_id`,`status`),
  KEY `bids_interior_offered_by_id_foreign` (`offered_by_id`),
  KEY `bids_interior_interior_id_index` (`interior_id`),
  KEY `bids_interior_interior_created_idx` (`interior_id`,`created_at`),
  KEY `bids_interior_payment_status_idx` (`payment_status`),
  CONSTRAINT `bids_interior_interior_id_foreign` FOREIGN KEY (`interior_id`) REFERENCES `interior_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_interior_offered_by_id_foreign` FOREIGN KEY (`offered_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bids_interior_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=415 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_kontraktor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_kontraktor` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `kontraktor_id` bigint unsigned DEFAULT NULL,
  `price` decimal(24,2) NOT NULL DEFAULT '0.00',
  `price_max` decimal(24,2) DEFAULT NULL,
  `negotiation_count` int NOT NULL DEFAULT '0',
  `fee_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed',
  `unit_price` decimal(24,2) DEFAULT NULL,
  `quantity` decimal(24,2) DEFAULT NULL,
  `calculated_total` decimal(24,2) DEFAULT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','shortlisted','invited','negotiating','contract_pending','awaiting_payment','accepted','active','rejected','declined','terminated','resigned','recommended') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `is_recommended` tinyint(1) NOT NULL DEFAULT '0',
  `estimated_duration` int DEFAULT NULL,
  `duration_unit` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `construction_method` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cost_breakdown` json DEFAULT NULL,
  `workforce_count` int DEFAULT NULL,
  `equipment_owned` text COLLATE utf8mb4_unicode_ci,
  `warranty_months` int DEFAULT NULL,
  `payment_preference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `paid_at` timestamp NULL DEFAULT NULL,
  `scopes` json DEFAULT NULL,
  `deliverables` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `offered_by_id` bigint unsigned DEFAULT NULL,
  `fee_agreed_at` timestamp NULL DEFAULT NULL,
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `proposed_termins` json DEFAULT NULL,
  `proposed_milestones` json DEFAULT NULL,
  `proposed_team` json DEFAULT NULL,
  `refunded_amount` decimal(24,2) NOT NULL DEFAULT '0.00' COMMENT 'Portion of this payment returned via dispute arbitration',
  PRIMARY KEY (`id`),
  UNIQUE KEY `bids_kontraktor_project_kontraktor_unique` (`project_id`,`kontraktor_id`),
  KEY `bids_kontraktor_offered_by_id_foreign` (`offered_by_id`),
  KEY `bids_kontraktor_project_id_status_index` (`project_id`,`status`),
  KEY `bids_kontraktor_kontraktor_id_index` (`kontraktor_id`),
  KEY `bids_kontraktor_kontraktor_created_idx` (`kontraktor_id`,`created_at`),
  KEY `bids_kontraktor_payment_status_idx` (`payment_status`),
  CONSTRAINT `bids_kontraktor_kontraktor_id_foreign` FOREIGN KEY (`kontraktor_id`) REFERENCES `kontraktors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_kontraktor_offered_by_id_foreign` FOREIGN KEY (`offered_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bids_kontraktor_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900014429 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_mep`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_mep` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `mep_id` bigint unsigned NOT NULL,
  `license_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `experience_years` int DEFAULT NULL,
  `price` decimal(24,2) NOT NULL,
  `price_max` decimal(24,2) DEFAULT NULL,
  `negotiation_count` int NOT NULL DEFAULT '0',
  `fee_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed',
  `unit_price` decimal(24,2) DEFAULT NULL,
  `quantity` decimal(24,2) DEFAULT NULL,
  `calculated_total` decimal(24,2) DEFAULT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `technical_notes` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `is_recommended` tinyint(1) NOT NULL DEFAULT '0',
  `interview_notes` text COLLATE utf8mb4_unicode_ci,
  `estimated_duration` int DEFAULT NULL,
  `duration_unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scopes` json DEFAULT NULL,
  `deliverables` json DEFAULT NULL,
  `payment_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `offered_by_id` bigint unsigned DEFAULT NULL,
  `fee_agreed_at` timestamp NULL DEFAULT NULL,
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `proposed_termins` json DEFAULT NULL,
  `proposed_milestones` json DEFAULT NULL,
  `refunded_amount` decimal(24,2) NOT NULL DEFAULT '0.00' COMMENT 'Portion of this payment returned via dispute arbitration',
  PRIMARY KEY (`id`),
  UNIQUE KEY `bids_mep_project_mep_unique` (`project_id`,`mep_id`),
  KEY `bids_mep_offered_by_id_foreign` (`offered_by_id`),
  KEY `bids_mep_project_id_status_index` (`project_id`,`status`),
  KEY `bids_mep_mep_id_index` (`mep_id`),
  KEY `bids_mep_mep_created_idx` (`mep_id`,`created_at`),
  KEY `bids_mep_payment_status_idx` (`payment_status`),
  CONSTRAINT `bids_mep_mep_id_foreign` FOREIGN KEY (`mep_id`) REFERENCES `mep_engineers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_mep_offered_by_id_foreign` FOREIGN KEY (`offered_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bids_mep_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900097024 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_notaris`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_notaris` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `notaris_id` bigint unsigned NOT NULL,
  `price` decimal(24,2) NOT NULL DEFAULT '0.00',
  `price_max` decimal(24,2) DEFAULT NULL,
  `negotiation_count` int NOT NULL DEFAULT '0',
  `fee_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed',
  `unit_price` decimal(24,2) DEFAULT NULL,
  `quantity` decimal(24,2) DEFAULT NULL,
  `calculated_total` decimal(24,2) DEFAULT NULL,
  `tax_estimate` decimal(24,2) DEFAULT NULL,
  `fee_percentage` decimal(5,2) DEFAULT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','shortlisted','invited','negotiating','contract_pending','awaiting_payment','accepted','active','rejected','declined','terminated','resigned','recommended') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `is_recommended` tinyint(1) NOT NULL DEFAULT '0',
  `estimated_duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration_unit` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `paid_at` timestamp NULL DEFAULT NULL,
  `selected_services` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `offered_by_id` bigint unsigned DEFAULT NULL,
  `fee_agreed_at` timestamp NULL DEFAULT NULL,
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `proposed_termins` json DEFAULT NULL,
  `proposed_milestones` json DEFAULT NULL,
  `refunded_amount` decimal(24,2) NOT NULL DEFAULT '0.00' COMMENT 'Portion of this payment returned via dispute arbitration',
  PRIMARY KEY (`id`),
  UNIQUE KEY `bids_notaris_project_notaris_unique` (`project_id`,`notaris_id`),
  KEY `bids_notaris_project_id_status_index` (`project_id`,`status`),
  KEY `bids_notaris_offered_by_id_foreign` (`offered_by_id`),
  KEY `bids_notaris_notaris_id_index` (`notaris_id`),
  KEY `bids_notaris_notaris_created_idx` (`notaris_id`,`created_at`),
  KEY `bids_notaris_payment_status_idx` (`payment_status`),
  CONSTRAINT `bids_notaris_notaris_id_foreign` FOREIGN KEY (`notaris_id`) REFERENCES `notaris_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_notaris_offered_by_id_foreign` FOREIGN KEY (`offered_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bids_notaris_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900109084 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_project_manager`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_project_manager` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `pm_id` bigint unsigned NOT NULL,
  `price` decimal(24,2) NOT NULL,
  `price_max` decimal(24,2) DEFAULT NULL,
  `negotiation_count` int NOT NULL DEFAULT '0',
  `proposal` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `estimated_duration` int DEFAULT NULL,
  `duration_unit` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'weeks',
  `attachment_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fee_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_price` decimal(24,2) DEFAULT NULL,
  `quantity` decimal(24,2) DEFAULT NULL,
  `calculated_total` decimal(24,2) DEFAULT NULL,
  `scopes` json DEFAULT NULL,
  `deliverables` json DEFAULT NULL,
  `payment_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `offered_by_id` bigint unsigned DEFAULT NULL,
  `fee_agreed_at` timestamp NULL DEFAULT NULL,
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `proposed_termins` json DEFAULT NULL,
  `proposed_milestones` json DEFAULT NULL,
  `refunded_amount` decimal(24,2) NOT NULL DEFAULT '0.00' COMMENT 'Portion of this payment returned via dispute arbitration',
  PRIMARY KEY (`id`),
  UNIQUE KEY `bids_pm_project_pm_unique` (`project_id`,`pm_id`),
  KEY `bids_project_manager_offered_by_id_foreign` (`offered_by_id`),
  KEY `bids_pm_project_id_status_index` (`project_id`,`status`),
  KEY `bids_pm_pm_id_index` (`pm_id`),
  KEY `bids_pm_pm_created_idx` (`pm_id`,`created_at`),
  KEY `bids_pm_payment_status_idx` (`payment_status`),
  CONSTRAINT `bids_project_manager_offered_by_id_foreign` FOREIGN KEY (`offered_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bids_project_manager_pm_id_foreign` FOREIGN KEY (`pm_id`) REFERENCES `project_managers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_project_manager_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900014008 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_structural`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_structural` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `structural_id` bigint unsigned NOT NULL,
  `license_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `experience_years` int DEFAULT NULL,
  `price` decimal(24,2) NOT NULL,
  `price_max` decimal(24,2) DEFAULT NULL,
  `negotiation_count` int NOT NULL DEFAULT '0',
  `fee_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed',
  `unit_price` decimal(24,2) DEFAULT NULL,
  `quantity` decimal(24,2) DEFAULT NULL,
  `calculated_total` decimal(24,2) DEFAULT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `technical_notes` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `is_recommended` tinyint(1) NOT NULL DEFAULT '0',
  `interview_notes` text COLLATE utf8mb4_unicode_ci,
  `estimated_duration` int DEFAULT NULL,
  `duration_unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scopes` json DEFAULT NULL,
  `deliverables` json DEFAULT NULL,
  `payment_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `offered_by_id` bigint unsigned DEFAULT NULL,
  `fee_agreed_at` timestamp NULL DEFAULT NULL,
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `proposed_termins` json DEFAULT NULL,
  `proposed_milestones` json DEFAULT NULL,
  `refunded_amount` decimal(24,2) NOT NULL DEFAULT '0.00' COMMENT 'Portion of this payment returned via dispute arbitration',
  PRIMARY KEY (`id`),
  UNIQUE KEY `bids_structural_project_structural_unique` (`project_id`,`structural_id`),
  KEY `bids_structural_offered_by_id_foreign` (`offered_by_id`),
  KEY `bids_structural_project_id_status_index` (`project_id`,`status`),
  KEY `bids_structural_structural_id_index` (`structural_id`),
  KEY `bids_structural_structural_created_idx` (`structural_id`,`created_at`),
  KEY `bids_structural_payment_status_idx` (`payment_status`),
  CONSTRAINT `bids_structural_offered_by_id_foreign` FOREIGN KEY (`offered_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `bids_structural_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_structural_structural_id_foreign` FOREIGN KEY (`structural_id`) REFERENCES `structural_engineers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900109166 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` int NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cache_locks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache_locks` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` int NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chat_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` bigint unsigned NOT NULL,
  `sender_id` bigint unsigned NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `chat_messages_sender_id_foreign` (`sender_id`),
  KEY `chat_msgs_conv_id_sender_id_is_read_index` (`conversation_id`,`sender_id`,`is_read`),
  KEY `chat_messages_conv_created_idx` (`conversation_id`,`created_at`),
  CONSTRAINT `chat_messages_conversation_id_foreign` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_messages_sender_id_foreign` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900121035 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contact`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contact` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `banner_dir` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `size` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contractor_subspecialties`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contractor_subspecialties` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('construction','mechanical','finishing') COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contractor_subspecialties_slug_unique` (`slug`),
  KEY `idx_category` (`category`)
) ENGINE=InnoDB AUTO_INCREMENT=82 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_one_id` bigint unsigned NOT NULL,
  `user_two_id` bigint unsigned NOT NULL,
  `last_message_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `conversations_user_one_id_user_two_id_unique` (`user_one_id`,`user_two_id`),
  KEY `conversations_user_two_id_index` (`user_two_id`),
  KEY `conversations_user_two_last_message_idx` (`user_two_id`,`last_message_at`),
  KEY `conversations_user_one_last_message_idx` (`user_one_id`,`last_message_at`),
  CONSTRAINT `conversations_user_one_id_foreign` FOREIGN KEY (`user_one_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conversations_user_two_id_foreign` FOREIGN KEY (`user_two_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900121032 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `courier_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courier_profiles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `vehicle_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `license_plate` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `verification_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `courier_profiles_user_id_foreign` (`user_id`),
  CONSTRAINT `courier_profiles_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900008002 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `delivery_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `delivery_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `quote_id` bigint unsigned NOT NULL,
  `order_id` bigint unsigned DEFAULT NULL,
  `logistics_id` bigint unsigned DEFAULT NULL,
  `pickup_address` text COLLATE utf8mb4_unicode_ci,
  `dropoff_address` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `agreed_fee` decimal(24,2) DEFAULT NULL,
  `estimated_weight` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `pickup_photos` json DEFAULT NULL,
  `delivery_photos` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `delivery_jobs_quote_id_foreign` (`quote_id`),
  KEY `delivery_jobs_order_id_foreign` (`order_id`),
  KEY `delivery_jobs_status_created_at_index` (`status`,`created_at`),
  KEY `delivery_jobs_logistics_id_status_index` (`logistics_id`,`status`),
  CONSTRAINT `delivery_jobs_logistics_id_foreign` FOREIGN KEY (`logistics_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `delivery_jobs_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `material_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `delivery_jobs_quote_id_foreign` FOREIGN KEY (`quote_id`) REFERENCES `material_quotes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900113156 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `dispute_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dispute_messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dispute_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `evidence_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_original_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `dispute_messages_user_id_foreign` (`user_id`),
  KEY `dispute_messages_dispute_id_created_at_index` (`dispute_id`,`created_at`),
  CONSTRAINT `dispute_messages_dispute_id_foreign` FOREIGN KEY (`dispute_id`) REFERENCES `project_disputes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dispute_messages_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=900123043 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `failed_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `failed_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `connection` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `queue` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `exception` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `favorites`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `favorites` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `favoritable_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `favoritable_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `favorites_unique` (`user_id`,`favoritable_type`,`favoritable_id`),
  KEY `favorites_user_type_index` (`user_id`,`favoritable_type`),
  CONSTRAINT `favorites_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900057188 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `firm_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `firm_members` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `firm_owner_id` bigint unsigned NOT NULL,
  `member_user_id` bigint unsigned NOT NULL,
  `role_in_firm` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('invited','active','removed','requested') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'invited',
  `invited_at` timestamp NULL DEFAULT NULL,
  `accepted_at` timestamp NULL DEFAULT NULL,
  `requested_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_firm_role_unique` (`firm_owner_id`,`member_user_id`,`role_in_firm`),
  KEY `idx_member_status` (`member_user_id`,`status`),
  CONSTRAINT `firm_members_firm_owner_id_foreign` FOREIGN KEY (`firm_owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `firm_members_member_user_id_foreign` FOREIGN KEY (`member_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900120111 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `house`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `house` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(24,2) DEFAULT NULL,
  `house_desc` text COLLATE utf8mb4_unicode_ci,
  `width` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `length` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `br` int NOT NULL DEFAULT '0',
  `ba` int NOT NULL DEFAULT '0',
  `floors` int NOT NULL DEFAULT '1',
  `coordinate` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `street_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kelurahan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kecamatan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kab_kota` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `province` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `postal_code` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `views` int NOT NULL DEFAULT '0',
  `id_user` bigint unsigned NOT NULL,
  `is_suspended` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `house_id_user_foreign` (`id_user`),
  KEY `house_is_suspended_created_at_index` (`is_suspended`,`created_at`),
  CONSTRAINT `house_id_user_foreign` FOREIGN KEY (`id_user`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900123072 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `house_answers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `house_answers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `question_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `answer` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `house_answers_question_id_foreign` (`question_id`),
  KEY `house_answers_user_id_foreign` (`user_id`),
  CONSTRAINT `house_answers_question_id_foreign` FOREIGN KEY (`question_id`) REFERENCES `house_questions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `house_answers_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900052119 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `house_pic`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `house_pic` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dir` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `size` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_house` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `house_pic_id_house_index` (`id_house`),
  CONSTRAINT `house_pic_id_house_foreign` FOREIGN KEY (`id_house`) REFERENCES `house` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900116026 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `house_questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `house_questions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `house_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `question` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `house_questions_house_id_foreign` (`house_id`),
  KEY `house_questions_user_id_foreign` (`user_id`),
  CONSTRAINT `house_questions_house_id_foreign` FOREIGN KEY (`house_id`) REFERENCES `house` (`id`) ON DELETE CASCADE,
  CONSTRAINT `house_questions_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900060312 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `interior_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `interior_profiles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `nama` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `no_telp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identity_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` enum('individual','company') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'individual',
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_license` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reliability_score` int NOT NULL DEFAULT '100',
  `file_portofolio` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_sertifikat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `spesialisasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'kitchen set, minimalist, modern, etc',
  `deskripsi` text COLLATE utf8mb4_unicode_ci,
  `lokasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pengalaman_tahun` int NOT NULL DEFAULT '0',
  `rate_harga` decimal(24,2) NOT NULL DEFAULT '0.00',
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `interior_profiles_user_id_unique` (`user_id`),
  CONSTRAINT `interior_profiles_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1813 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `interior_ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `interior_ratings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `reviewer_id` bigint unsigned NOT NULL,
  `interior_id` bigint unsigned NOT NULL,
  `rating` int NOT NULL,
  `komentar` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `interior_ratings_project_id_foreign` (`project_id`),
  KEY `interior_ratings_reviewer_id_foreign` (`reviewer_id`),
  KEY `interior_ratings_interior_id_foreign` (`interior_id`),
  CONSTRAINT `interior_ratings_interior_id_foreign` FOREIGN KEY (`interior_id`) REFERENCES `interior_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `interior_ratings_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `interior_ratings_reviewer_id_foreign` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `job_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_batches` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_jobs` int NOT NULL,
  `pending_jobs` int NOT NULL,
  `failed_jobs` int NOT NULL,
  `failed_job_ids` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `options` mediumtext COLLATE utf8mb4_unicode_ci,
  `cancelled_at` int DEFAULT NULL,
  `created_at` int NOT NULL,
  `finished_at` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempts` tinyint unsigned NOT NULL,
  `reserved_at` int unsigned DEFAULT NULL,
  `available_at` int unsigned NOT NULL,
  `created_at` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `kontraktor_ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `kontraktor_ratings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `reviewer_id` bigint unsigned NOT NULL,
  `kontraktor_id` bigint unsigned NOT NULL,
  `rating` int NOT NULL,
  `komentar` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `kontraktor_ratings_project_id_foreign` (`project_id`),
  KEY `kontraktor_ratings_reviewer_id_foreign` (`reviewer_id`),
  KEY `kontraktor_ratings_kontraktor_id_foreign` (`kontraktor_id`),
  CONSTRAINT `kontraktor_ratings_kontraktor_id_foreign` FOREIGN KEY (`kontraktor_id`) REFERENCES `kontraktors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `kontraktor_ratings_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `kontraktor_ratings_reviewer_id_foreign` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `kontraktor_spesialisasi`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `kontraktor_spesialisasi` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `kontraktor_id` bigint unsigned NOT NULL,
  `spesialisasi_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `kontraktor_spesialisasi_kontraktor_id_foreign` (`kontraktor_id`),
  KEY `kontraktor_spesialisasi_spesialisasi_id_foreign` (`spesialisasi_id`),
  CONSTRAINT `kontraktor_spesialisasi_kontraktor_id_foreign` FOREIGN KEY (`kontraktor_id`) REFERENCES `kontraktors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `kontraktor_spesialisasi_spesialisasi_id_foreign` FOREIGN KEY (`spesialisasi_id`) REFERENCES `spesialisasi` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `kontraktors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `kontraktors` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `nama` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `no_telepon` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alamat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `jenis` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nama_perusahaan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pengalaman` int NOT NULL DEFAULT '0',
  `spesialisasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subspecialties` json DEFAULT NULL,
  `rate_harga` decimal(24,2) NOT NULL DEFAULT '0.00',
  `pendidikan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alasan_hire` text COLLATE utf8mb4_unicode_ci,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_portofolio` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_sertifikat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identity_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` enum('individual','company') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'individual',
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_license` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reliability_score` int NOT NULL DEFAULT '100',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `kontraktors_user_id_foreign` (`user_id`),
  CONSTRAINT `kontraktors_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900033525 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `material_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_images` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `material_id` bigint unsigned NOT NULL,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `material_images_material_id_foreign` (`material_id`),
  CONSTRAINT `material_images_material_id_foreign` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=82 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `material_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_order_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `material_id` bigint unsigned NOT NULL,
  `quantity` int NOT NULL,
  `price_at_order` decimal(24,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `requirement_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `material_order_items_order_id_foreign` (`order_id`),
  KEY `material_order_items_material_id_foreign` (`material_id`),
  KEY `material_order_items_requirement_id_index` (`requirement_id`),
  CONSTRAINT `material_order_items_material_id_foreign` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`) ON DELETE CASCADE,
  CONSTRAINT `material_order_items_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `material_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900115147 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `material_order_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_order_reviews` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `supplier_id` bigint unsigned NOT NULL,
  `order_id` bigint unsigned NOT NULL,
  `rating` int NOT NULL DEFAULT '5',
  `comment` text COLLATE utf8mb4_unicode_ci,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `delivery_rating` int DEFAULT NULL,
  `delivery_comment` text COLLATE utf8mb4_unicode_ci,
  `delivery_user_id` bigint unsigned DEFAULT NULL,
  `image_paths` json DEFAULT NULL,
  `delivery_image_paths` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `material_order_reviews_order_id_unique` (`order_id`),
  KEY `material_order_reviews_user_id_foreign` (`user_id`),
  KEY `material_order_reviews_supplier_id_foreign` (`supplier_id`),
  KEY `material_order_reviews_delivery_user_id_index` (`delivery_user_id`),
  CONSTRAINT `material_order_reviews_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `material_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `material_order_reviews_supplier_id_foreign` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `material_order_reviews_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900047357 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `material_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `supplier_id` bigint unsigned NOT NULL,
  `project_id` bigint unsigned DEFAULT NULL,
  `status` enum('pending','awaiting_payment','verifying','paid','shipping','delivered','completed','cancelled','processing','ready_for_pickup','refunded') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `total_price` decimal(24,2) NOT NULL,
  `shipping_cost` decimal(24,2) NOT NULL DEFAULT '0.00',
  `whatsapp_order_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `paid_at` timestamp NULL DEFAULT NULL,
  `shipped_at` timestamp NULL DEFAULT NULL,
  `delivered_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `refunded_amount` decimal(24,2) NOT NULL DEFAULT '0.00' COMMENT 'Portion of this payment returned via dispute arbitration',
  `delivery_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ready_for_pickup_at` timestamp NULL DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `delivery_address` text COLLATE utf8mb4_unicode_ci,
  `address_detail` text COLLATE utf8mb4_unicode_ci,
  `delivery_documentation_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_stock_decremented` tinyint(1) NOT NULL DEFAULT '0',
  `total_weight` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `material_orders_whatsapp_order_id_unique` (`whatsapp_order_id`),
  KEY `material_orders_project_id_foreign` (`project_id`),
  KEY `material_orders_supplier_id_status_index` (`supplier_id`,`status`),
  KEY `material_orders_user_id_created_at_index` (`user_id`,`created_at`),
  CONSTRAINT `material_orders_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `material_orders_supplier_id_foreign` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `material_orders_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900115191 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `material_quotes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_quotes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `supplier_id` bigint unsigned NOT NULL,
  `project_id` bigint unsigned DEFAULT NULL,
  `items` json NOT NULL,
  `delivery_address` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_amount` decimal(24,2) NOT NULL DEFAULT '0.00',
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `shipping_cost` decimal(24,2) NOT NULL DEFAULT '0.00',
  `delivery_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `address_detail` text COLLATE utf8mb4_unicode_ci,
  `total_weight` decimal(10,2) DEFAULT NULL,
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Buyer-uploaded transfer receipt. Stored on the PRIVATE vault disk.',
  `paid_at` timestamp NULL DEFAULT NULL,
  `payment_verified_by` bigint unsigned DEFAULT NULL,
  `payment_verified_at` timestamp NULL DEFAULT NULL,
  `payment_notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `material_quotes_user_id_foreign` (`user_id`),
  KEY `material_quotes_project_id_foreign` (`project_id`),
  KEY `material_quotes_supplier_id_status_index` (`supplier_id`,`status`),
  CONSTRAINT `material_quotes_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `material_quotes_supplier_id_foreign` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `material_quotes_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900114335 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `materials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `materials` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `supplier_id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `price` decimal(24,2) NOT NULL,
  `unit` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stock` int NOT NULL DEFAULT '0',
  `is_available` tinyint(1) NOT NULL DEFAULT '1',
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `specifications` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `materials_supplier_id_foreign` (`supplier_id`),
  KEY `materials_available_created_idx` (`is_available`,`created_at`),
  KEY `materials_category_price_idx` (`category`,`price`),
  CONSTRAINT `materials_supplier_id_foreign` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900051549 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `mep_engineers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mep_engineers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `nama` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `no_telp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rate_harga` decimal(24,2) NOT NULL DEFAULT '0.00',
  `reliability_score` int NOT NULL DEFAULT '100' COMMENT 'Deducted on termination (10) or resignation (5); floored at 0.',
  `spesialisasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deskripsi` text COLLATE utf8mb4_unicode_ci,
  `lokasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pengalaman_tahun` int NOT NULL DEFAULT '0',
  `file_portofolio` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_sertifikat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pendidikan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alasan_hire` text COLLATE utf8mb4_unicode_ci,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identity_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` enum('individual','company') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'individual',
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_license` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `mep_engineers_user_id_foreign` (`user_id`),
  CONSTRAINT `mep_engineers_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900007674 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=229 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `model_has_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `model_has_permissions` (
  `permission_id` bigint unsigned NOT NULL,
  `model_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`permission_id`,`model_id`,`model_type`),
  KEY `model_has_permissions_model_id_model_type_index` (`model_id`,`model_type`),
  CONSTRAINT `model_has_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `model_has_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `model_has_roles` (
  `role_id` bigint unsigned NOT NULL,
  `model_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`role_id`,`model_id`,`model_type`),
  KEY `model_has_roles_model_id_model_type_index` (`model_id`,`model_type`),
  CONSTRAINT `model_has_roles_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notaris_consultations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notaris_consultations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notaris_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `schedule_date` datetime NOT NULL,
  `status` enum('pending','confirmed','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `notaris_consultations_notaris_id_foreign` (`notaris_id`),
  KEY `notaris_consultations_user_id_foreign` (`user_id`),
  CONSTRAINT `notaris_consultations_notaris_id_foreign` FOREIGN KEY (`notaris_id`) REFERENCES `notaris_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notaris_consultations_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900105092 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notaris_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notaris_profiles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `nama` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `no_telp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_portofolio` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identity_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` enum('individual','company') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'individual',
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_license` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reliability_score` int NOT NULL DEFAULT '100',
  `nomor_sk` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'License/SK number',
  `wilayah_kerja` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Work jurisdiction area',
  `spesialisasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'AJB, PBG, SHM, etc',
  `deskripsi` text COLLATE utf8mb4_unicode_ci,
  `lokasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pengalaman_tahun` int NOT NULL DEFAULT '0',
  `rate_harga` decimal(24,2) NOT NULL DEFAULT '0.00',
  `file_sertifikat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notaris_profiles_user_id_unique` (`user_id`),
  CONSTRAINT `notaris_profiles_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900005212 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notaris_ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notaris_ratings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `reviewer_id` bigint unsigned NOT NULL,
  `notaris_id` bigint unsigned NOT NULL,
  `rating` int NOT NULL,
  `komentar` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `notaris_ratings_project_id_foreign` (`project_id`),
  KEY `notaris_ratings_reviewer_id_foreign` (`reviewer_id`),
  KEY `notaris_ratings_notaris_id_foreign` (`notaris_id`),
  CONSTRAINT `notaris_ratings_notaris_id_foreign` FOREIGN KEY (`notaris_id`) REFERENCES `notaris_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notaris_ratings_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notaris_ratings_reviewer_id_foreign` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notaris_services`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notaris_services` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notaris_id` bigint unsigned NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(24,2) NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `notaris_services_notaris_id_foreign` (`notaris_id`),
  CONSTRAINT `notaris_services_notaris_id_foreign` FOREIGN KEY (`notaris_id`) REFERENCES `notaris_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_preferences` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `type` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `channel` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `quiet_hours_start` time DEFAULT NULL,
  `quiet_hours_end` time DEFAULT NULL,
  `digest` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_prefs_unique` (`user_id`,`type`,`channel`),
  KEY `notification_preferences_user_id_channel_index` (`user_id`,`channel`),
  CONSTRAINT `notification_preferences_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=300 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `data` json DEFAULT NULL,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `notifications_user_id_read_at_index` (`user_id`,`read_at`),
  KEY `notifications_user_created_idx` (`user_id`,`created_at`),
  KEY `notifications_user_read_created_idx` (`user_id`,`read_at`,`created_at`),
  CONSTRAINT `notifications_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900124340 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `p_m_ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `p_m_ratings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `pm_id` bigint unsigned NOT NULL,
  `rating` int NOT NULL,
  `komentar` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `p_m_ratings_project_id_foreign` (`project_id`),
  KEY `p_m_ratings_user_id_foreign` (`user_id`),
  KEY `p_m_ratings_pm_id_foreign` (`pm_id`),
  CONSTRAINT `p_m_ratings_pm_id_foreign` FOREIGN KEY (`pm_id`) REFERENCES `project_managers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `p_m_ratings_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `p_m_ratings_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_reset_tokens` (
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `guard_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `permissions_name_guard_name_unique` (`name`,`guard_name`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `personal_access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `personal_access_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tokenable_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tokenable_id` bigint unsigned NOT NULL,
  `name` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `abilities` text COLLATE utf8mb4_unicode_ci,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `personal_access_tokens_token_unique` (`token`),
  KEY `personal_access_tokens_tokenable_type_tokenable_id_index` (`tokenable_type`,`tokenable_id`),
  KEY `personal_access_tokens_expires_at_index` (`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=215012 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `phone_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `phone_user` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `contact` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_user` bigint unsigned NOT NULL,
  `id_contact` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `phone_user_id_user_foreign` (`id_user`),
  KEY `phone_user_id_contact_foreign` (`id_contact`),
  CONSTRAINT `phone_user_id_contact_foreign` FOREIGN KEY (`id_contact`) REFERENCES `contact` (`id`) ON DELETE CASCADE,
  CONSTRAINT `phone_user_id_user_foreign` FOREIGN KEY (`id_user`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15663 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `professional_portfolios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `professional_portfolios` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `role_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `client_review` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `professional_portfolios_user_id_foreign` (`user_id`),
  CONSTRAINT `professional_portfolios_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900120055 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_activity_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `action` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `details` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_activity_logs_user_id_foreign` (`user_id`),
  KEY `project_activity_logs_project_created_idx` (`project_id`,`created_at`),
  KEY `project_activity_logs_project_id_fk_support` (`project_id`),
  CONSTRAINT `project_activity_logs_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_activity_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900096003 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_addendums`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_addendums` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'extra_fee',
  `role_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `team_member_id` bigint unsigned DEFAULT NULL,
  `specialist_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `negotiation_note` text COLLATE utf8mb4_unicode_ci,
  `attachment_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(24,2) NOT NULL,
  `counter_offer_amount` decimal(24,2) DEFAULT NULL,
  `recommended_bid_id` bigint unsigned DEFAULT NULL,
  `recommended_bid_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending_approval','approved','approved_unpaid','authorized','verifying','paid','rejected','negotiating','accepted_by_pro','refunded') COLLATE utf8mb4_unicode_ci DEFAULT 'pending_approval',
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `procurement_request_id` bigint unsigned DEFAULT NULL,
  `assigned_user_id` bigint unsigned DEFAULT NULL,
  `refunded_amount` decimal(24,2) NOT NULL DEFAULT '0.00' COMMENT 'Portion of this payment returned via dispute arbitration',
  PRIMARY KEY (`id`),
  KEY `project_addendums_project_id_foreign` (`project_id`),
  KEY `project_addendums_user_id_foreign` (`user_id`),
  KEY `project_addendums_procurement_request_id_foreign` (`procurement_request_id`),
  KEY `project_addendums_team_member_id_foreign` (`team_member_id`),
  KEY `project_addendums_assigned_user_id_foreign` (`assigned_user_id`),
  KEY `project_addendums_recommended_bid_idx` (`recommended_bid_id`),
  KEY `project_addendums_recommended_bid_id_fk_support` (`recommended_bid_id`),
  CONSTRAINT `project_addendums_assigned_user_id_foreign` FOREIGN KEY (`assigned_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_addendums_procurement_request_id_foreign` FOREIGN KEY (`procurement_request_id`) REFERENCES `project_procurement_requests` (`id`) ON DELETE SET NULL,
  CONSTRAINT `project_addendums_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_addendums_team_member_id_foreign` FOREIGN KEY (`team_member_id`) REFERENCES `team_members` (`id`) ON DELETE SET NULL,
  CONSTRAINT `project_addendums_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900090992 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_budget_sandbox`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_budget_sandbox` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estimated_amount` decimal(24,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_budget_sandbox_project_id_foreign` (`project_id`),
  CONSTRAINT `project_budget_sandbox_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900027112 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_budget_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_budget_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `transaction_type` enum('deposit','adjustment_down','payment','refund','platform_fee','retention_release') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(24,2) NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `reference_model` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_id` bigint unsigned DEFAULT NULL,
  `reverses_model` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'For a refund: the payment this reversal returns. NULL for any other type.',
  `reverses_id` bigint unsigned DEFAULT NULL COMMENT 'For a refund: the id of the payment this reversal returns.',
  `transaction_date` timestamp NOT NULL,
  `actor_user_id` bigint unsigned DEFAULT NULL COMMENT 'User who caused this movement. NULL = no human actor (system/scheduled/reconciliation).',
  `actor_role` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voided_at` timestamp NULL DEFAULT NULL,
  `voided_duplicate_of_id` bigint unsigned DEFAULT NULL,
  `voided_original_amount` decimal(24,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `budget_tx_reference_unique` (`project_id`,`reference_model`,`reference_id`,`transaction_type`),
  KEY `project_budget_transactions_project_id_fk_support` (`project_id`),
  KEY `budget_tx_project_type_idx` (`project_id`,`transaction_type`),
  KEY `budget_tx_reverses_idx` (`project_id`,`reverses_model`,`reverses_id`),
  KEY `budget_tx_project_actor_index` (`project_id`,`actor_user_id`),
  CONSTRAINT `project_budget_transactions_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=31698 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_change_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_change_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `requested_by` bigint unsigned NOT NULL,
  `role_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `cost_impact` decimal(24,2) NOT NULL DEFAULT '0.00',
  `time_impact_days` int NOT NULL DEFAULT '0',
  `status` enum('proposed','pm_reviewed','owner_approved','rejected','implemented') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'proposed',
  `pm_notes` text COLLATE utf8mb4_unicode_ci,
  `owner_notes` text COLLATE utf8mb4_unicode_ci,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `milestone_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_change_orders_requested_by_foreign` (`requested_by`),
  KEY `project_change_orders_project_id_status_index` (`project_id`,`status`),
  KEY `project_change_orders_milestone_id_foreign` (`milestone_id`),
  CONSTRAINT `project_change_orders_milestone_id_foreign` FOREIGN KEY (`milestone_id`) REFERENCES `project_milestones` (`id`) ON DELETE SET NULL,
  CONSTRAINT `project_change_orders_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_change_orders_requested_by_foreign` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=900023319 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_comments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `parent_id` bigint unsigned DEFAULT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_comments_project_id_foreign` (`project_id`),
  KEY `project_comments_user_id_foreign` (`user_id`),
  KEY `project_comments_parent_id_foreign` (`parent_id`),
  CONSTRAINT `project_comments_parent_id_foreign` FOREIGN KEY (`parent_id`) REFERENCES `project_comments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_comments_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_comments_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900092132 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_daily_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_daily_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `log_date` date NOT NULL,
  `weather` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sunny',
  `worker_count` int NOT NULL DEFAULT '0',
  `activities` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `issues` text COLLATE utf8mb4_unicode_ci,
  `photos` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_daily_logs_user_id_foreign` (`user_id`),
  KEY `project_daily_logs_project_id_log_date_index` (`project_id`,`log_date`),
  CONSTRAINT `project_daily_logs_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_daily_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900034570 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_delays`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_delays` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `phase_slug` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `days` int NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'external',
  `logged_at` date NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_delays_project_id_foreign` (`project_id`),
  CONSTRAINT `project_delays_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900040409 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_disputes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_disputes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `opened_by` bigint unsigned NOT NULL,
  `termination_id` bigint unsigned DEFAULT NULL,
  `resolved_by` bigint unsigned DEFAULT NULL,
  `category` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `disputed_amount` decimal(24,2) DEFAULT NULL,
  `payment_type` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_id` bigint unsigned DEFAULT NULL,
  `resolution` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolution_notes` text COLLATE utf8mb4_unicode_ci,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_disputes_opened_by_foreign` (`opened_by`),
  KEY `project_disputes_termination_id_foreign` (`termination_id`),
  KEY `project_disputes_resolved_by_foreign` (`resolved_by`),
  KEY `project_disputes_project_id_status_index` (`project_id`,`status`),
  KEY `project_disputes_category_index` (`category`),
  KEY `project_disputes_status_index` (`status`),
  CONSTRAINT `project_disputes_opened_by_foreign` FOREIGN KEY (`opened_by`) REFERENCES `users` (`id`),
  CONSTRAINT `project_disputes_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_disputes_resolved_by_foreign` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `project_disputes_termination_id_foreign` FOREIGN KEY (`termination_id`) REFERENCES `project_terminations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=900123171 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_documents` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `uploader_id` bigint unsigned NOT NULL,
  `parent_id` bigint unsigned DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `version` int NOT NULL DEFAULT '1',
  `file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'structural|mep|architect - who this doc is for',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `review_note` text COLLATE utf8mb4_unicode_ci,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `version_label` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_documents_project_id_foreign` (`project_id`),
  KEY `project_documents_uploader_id_foreign` (`uploader_id`),
  KEY `project_documents_parent_id_foreign` (`parent_id`),
  CONSTRAINT `project_documents_parent_id_foreign` FOREIGN KEY (`parent_id`) REFERENCES `project_documents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_documents_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_documents_uploader_id_foreign` FOREIGN KEY (`uploader_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900107273 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_external_vendors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_external_vendors` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `team_member_id` bigint unsigned DEFAULT NULL,
  `phase_role` enum('arsitek','kontraktor','notaris','interior','project_manager','structural','mep') COLLATE utf8mb4_unicode_ci NOT NULL,
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_person` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_number` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `agreed_fee` decimal(24,2) DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_external_vendors_project_id_foreign` (`project_id`),
  KEY `project_external_vendors_team_member_id_foreign` (`team_member_id`),
  CONSTRAINT `project_external_vendors_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_external_vendors_team_member_id_foreign` FOREIGN KEY (`team_member_id`) REFERENCES `team_members` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=900039180 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_images` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` tinyint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_images_project_id_foreign` (`project_id`),
  CONSTRAINT `project_images_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900039002 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_managers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_managers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `nama` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `no_telp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rate_harga` decimal(24,2) NOT NULL DEFAULT '0.00',
  `spesialisasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deskripsi` text COLLATE utf8mb4_unicode_ci,
  `lokasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pengalaman_tahun` int NOT NULL DEFAULT '0',
  `file_portofolio` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_sertifikat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pendidikan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alasan_hire` text COLLATE utf8mb4_unicode_ci,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identity_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` enum('individual','company') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'individual',
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_license` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reliability_score` int NOT NULL DEFAULT '100',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_managers_user_id_foreign` (`user_id`),
  CONSTRAINT `project_managers_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900009818 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_material_folders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_material_folders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bom_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'raw',
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_material_folders_project_id_foreign` (`project_id`),
  KEY `project_material_folders_created_by_foreign` (`created_by`),
  CONSTRAINT `project_material_folders_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `project_material_folders_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900021240 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_milestones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_milestones` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `arsitek_id` bigint unsigned DEFAULT NULL,
  `kontraktor_id` bigint unsigned DEFAULT NULL,
  `notaris_id` bigint unsigned DEFAULT NULL,
  `interior_id` bigint unsigned DEFAULT NULL,
  `pm_id` bigint unsigned DEFAULT NULL,
  `structural_id` bigint unsigned DEFAULT NULL,
  `mep_id` bigint unsigned DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'milestone',
  `content` json DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `review_note` text COLLATE utf8mb4_unicode_ci,
  `review_status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `start_date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `is_completed` tinyint(1) NOT NULL DEFAULT '0',
  `approval_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `revision_notes` text COLLATE utf8mb4_unicode_ci,
  `phase_context` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lead_pro_verified_at` timestamp NULL DEFAULT NULL,
  `pm_verified_at` timestamp NULL DEFAULT NULL,
  `progress_attachment` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_milestones_project_id_foreign` (`project_id`),
  KEY `project_milestones_structural_id_index` (`structural_id`),
  KEY `project_milestones_mep_id_index` (`mep_id`),
  CONSTRAINT `project_milestones_mep_id_foreign` FOREIGN KEY (`mep_id`) REFERENCES `mep_engineers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_milestones_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_milestones_structural_id_foreign` FOREIGN KEY (`structural_id`) REFERENCES `structural_engineers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900102618 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_payment_termins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_payment_termins` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `role_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recipient_id` bigint unsigned DEFAULT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `percentage` decimal(5,2) NOT NULL DEFAULT '0.00',
  `amount` decimal(24,2) NOT NULL DEFAULT '0.00',
  `retention_amount` decimal(24,2) NOT NULL DEFAULT '0.00',
  `retention_released_at` timestamp NULL DEFAULT NULL,
  `retention_released_amount` decimal(24,2) DEFAULT NULL,
  `net_amount` decimal(24,2) NOT NULL DEFAULT '0.00',
  `trigger_description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'locked',
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `milestone_id` bigint unsigned DEFAULT NULL,
  `change_order_id` bigint unsigned DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `retention_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `refunded_amount` decimal(24,2) NOT NULL DEFAULT '0.00' COMMENT 'Portion of this payment returned via dispute arbitration',
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_termin_change_order_unique` (`change_order_id`),
  KEY `project_payment_termins_project_id_index` (`project_id`),
  KEY `project_payment_termins_milestone_id_foreign` (`milestone_id`),
  KEY `project_payment_termins_role_type_index` (`role_type`),
  KEY `project_payment_termins_recipient_id_foreign` (`recipient_id`),
  CONSTRAINT `project_payment_termins_change_order_id_foreign` FOREIGN KEY (`change_order_id`) REFERENCES `project_change_orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `project_payment_termins_milestone_id_foreign` FOREIGN KEY (`milestone_id`) REFERENCES `project_milestones` (`id`) ON DELETE SET NULL,
  CONSTRAINT `project_payment_termins_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_payment_termins_recipient_id_foreign` FOREIGN KEY (`recipient_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=900092184 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_procurement_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_procurement_requests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `requirement_id` bigint unsigned NOT NULL,
  `requested_by` bigint unsigned NOT NULL,
  `quantity_needed` decimal(18,2) NOT NULL,
  `estimated_unit_cost` decimal(24,2) DEFAULT NULL,
  `estimated_cost` decimal(24,2) DEFAULT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `offer_to_buy` tinyint(1) NOT NULL DEFAULT '0',
  `status` enum('pending_pm','pending_owner','authorized','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending_pm',
  `pm_note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_procurement_requests_project_id_foreign` (`project_id`),
  KEY `project_procurement_requests_requirement_id_foreign` (`requirement_id`),
  KEY `project_procurement_requests_requested_by_foreign` (`requested_by`),
  CONSTRAINT `project_procurement_requests_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_procurement_requests_requested_by_foreign` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_procurement_requests_requirement_id_foreign` FOREIGN KEY (`requirement_id`) REFERENCES `project_requirements` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900025441 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_reports` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `phase_slug` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` bigint unsigned NOT NULL,
  `summary` longtext COLLATE utf8mb4_unicode_ci,
  `progress_percentage` int NOT NULL DEFAULT '0',
  `budget_health` enum('on_track','warning','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'on_track',
  `site_photos` json DEFAULT NULL,
  `attachments` json DEFAULT NULL,
  `published_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_reports_created_by_foreign` (`created_by`),
  KEY `project_reports_project_id_published_at_index` (`project_id`,`published_at`),
  CONSTRAINT `project_reports_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_reports_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900040443 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_requirement_histories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_requirement_histories` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_requirement_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `type` enum('restock','use') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(24,2) NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_requirement_histories_project_requirement_id_foreign` (`project_requirement_id`),
  KEY `project_requirement_histories_user_id_foreign` (`user_id`),
  CONSTRAINT `project_requirement_histories_project_requirement_id_foreign` FOREIGN KEY (`project_requirement_id`) REFERENCES `project_requirements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_requirement_histories_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=900021603 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_requirements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_requirements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bom_type` enum('raw','finishing') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'raw',
  `quantity_required` decimal(15,2) NOT NULL,
  `estimated_unit_cost` decimal(24,2) DEFAULT NULL,
  `quantity_on_site` decimal(15,2) NOT NULL DEFAULT '0.00',
  `quantity_used` decimal(15,2) NOT NULL DEFAULT '0.00',
  `quantity_procured_externally` decimal(15,2) NOT NULL DEFAULT '0.00',
  `external_cost` decimal(24,2) NOT NULL DEFAULT '0.00',
  `unit` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quality_level` enum('standard','premium','luxury') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'standard',
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `purpose` text COLLATE utf8mb4_unicode_ci,
  `category` enum('structural','architecture','mep','interior','general') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `folder_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_requirements_project_id_foreign` (`project_id`),
  KEY `project_requirements_user_id_foreign` (`user_id`),
  KEY `project_requirements_folder_id_foreign` (`folder_id`),
  CONSTRAINT `project_requirements_folder_id_foreign` FOREIGN KEY (`folder_id`) REFERENCES `project_material_folders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `project_requirements_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_requirements_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=900020899 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_schedules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `phase_slug` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_start_date` date DEFAULT NULL,
  `target_end_date` date DEFAULT NULL,
  `original_target_end_date` date DEFAULT NULL,
  `shifted_days` int NOT NULL DEFAULT '0',
  `actual_start_date` date DEFAULT NULL,
  `actual_end_date` date DEFAULT NULL,
  `progress_percentage` int NOT NULL DEFAULT '0',
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_schedules_project_id_phase_slug_unique` (`project_id`,`phase_slug`),
  CONSTRAINT `project_schedules_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900036594 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_snag_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_snag_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `severity` enum('minor','major','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'minor',
  `photos` json DEFAULT NULL,
  `status` enum('open','in_progress','resolved','accepted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `due_at` timestamp NULL DEFAULT NULL,
  `escalated_at` timestamp NULL DEFAULT NULL,
  `assigned_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reported_by` bigint unsigned NOT NULL,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `resolution_note` text COLLATE utf8mb4_unicode_ci,
  `resolution_photos` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_snag_items_reported_by_foreign` (`reported_by`),
  KEY `project_snag_items_project_id_status_index` (`project_id`,`status`),
  KEY `project_snag_items_due_at_idx` (`due_at`),
  KEY `project_snag_items_escalated_at_idx` (`escalated_at`),
  KEY `project_snag_items_due_at_fk_support` (`due_at`),
  KEY `project_snag_items_escalated_at_fk_support` (`escalated_at`),
  CONSTRAINT `project_snag_items_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_snag_items_reported_by_foreign` FOREIGN KEY (`reported_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=900033431 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_sub_professionals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_sub_professionals` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `parent_role` enum('arsitek','kontraktor','notaris','interior','structural','mep','project_manager') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sub_role` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assigned_by` bigint unsigned NOT NULL,
  `status` enum('invited','interviewing','accepted','recommended','active','completed','removed') COLLATE utf8mb4_unicode_ci DEFAULT 'invited',
  `rate` decimal(24,2) NOT NULL DEFAULT '0.00',
  `scope_notes` text COLLATE utf8mb4_unicode_ci,
  `lead_pro_notes` text COLLATE utf8mb4_unicode_ci,
  `suggested_fee` decimal(24,2) DEFAULT NULL,
  `accepted_at` timestamp NULL DEFAULT NULL,
  `recommended_at` timestamp NULL DEFAULT NULL,
  `hired_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_project_sub` (`project_id`,`user_id`,`sub_role`),
  KEY `project_sub_professionals_assigned_by_foreign` (`assigned_by`),
  KEY `idx_project_status` (`project_id`,`status`),
  KEY `idx_user_role` (`user_id`,`sub_role`),
  CONSTRAINT `project_sub_professionals_assigned_by_foreign` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_sub_professionals_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_sub_professionals_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900109166 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_terminations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_terminations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `initiator_id` bigint unsigned NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `settlement_terms` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','accepted','rejected','escalated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `resolution_notes` text COLLATE utf8mb4_unicode_ci,
  `resolved_by_id` bigint unsigned DEFAULT NULL,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_terminations_project_id_foreign` (`project_id`),
  KEY `project_terminations_initiator_id_foreign` (`initiator_id`),
  KEY `project_terminations_resolved_by_id_foreign` (`resolved_by_id`),
  CONSTRAINT `project_terminations_initiator_id_foreign` FOREIGN KEY (`initiator_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_terminations_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_terminations_resolved_by_id_foreign` FOREIGN KEY (`resolved_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=900080267 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_timeline_extensions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_timeline_extensions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `requester_id` bigint unsigned NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `days_requested` int NOT NULL,
  `status` enum('proposed','pm_reviewed','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'proposed',
  `original_deadline` date NOT NULL,
  `new_deadline_date` date DEFAULT NULL,
  `pm_notes` text COLLATE utf8mb4_unicode_ci,
  `owner_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_timeline_extensions_project_id_foreign` (`project_id`),
  KEY `project_timeline_extensions_requester_id_foreign` (`requester_id`),
  CONSTRAINT `project_timeline_extensions_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_timeline_extensions_requester_id_foreign` FOREIGN KEY (`requester_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=900036089 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_warranty_claims`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_warranty_claims` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `reporter_id` bigint unsigned NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `images` json DEFAULT NULL,
  `status` enum('open','fixing','resolved','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `cost_impact` decimal(24,2) NOT NULL DEFAULT '0.00',
  `resolved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_warranty_claims_project_id_foreign` (`project_id`),
  KEY `project_warranty_claims_reporter_id_foreign` (`reporter_id`),
  CONSTRAINT `project_warranty_claims_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_warranty_claims_reporter_id_foreign` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=900037794 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `budget` decimal(24,2) NOT NULL DEFAULT '0.00',
  `lokasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `jenis_proyek` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_id` bigint unsigned DEFAULT NULL,
  `selected_arsitek_id` bigint unsigned DEFAULT NULL,
  `selected_kontraktor_id` bigint unsigned DEFAULT NULL,
  `selected_notaris_id` bigint unsigned DEFAULT NULL,
  `selected_interior_id` bigint unsigned DEFAULT NULL,
  `pm_id` bigint unsigned DEFAULT NULL,
  `structural_id` bigint unsigned DEFAULT NULL,
  `mep_id` bigint unsigned DEFAULT NULL,
  `structural_approved_at` timestamp NULL DEFAULT NULL,
  `mep_approved_at` timestamp NULL DEFAULT NULL,
  `status` enum('open','accepted_arsitek','accepted_kontraktor','awaiting_payment','in_progress','termination_pending','legal','procurement','completed_build','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `published_bidding_roles` json DEFAULT NULL,
  `bidding_choices` json DEFAULT NULL,
  `target_role` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'arsitek',
  `needed_phases` json DEFAULT NULL,
  `completed_phases` json DEFAULT NULL,
  `wants_project_manager` tinyint(1) NOT NULL DEFAULT '0',
  `requires_structural` tinyint(1) NOT NULL DEFAULT '0',
  `requires_mep` tinyint(1) NOT NULL DEFAULT '0',
  `requires_interior` tinyint(1) NOT NULL DEFAULT '0',
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `province` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kecamatan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kelurahan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `postal_code` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `street_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `design_details` json DEFAULT NULL,
  `design_completed_at` timestamp NULL DEFAULT NULL,
  `design_authorized_at` timestamp NULL DEFAULT NULL,
  `materials_authorized_at` timestamp NULL DEFAULT NULL,
  `design_locked_at` timestamp NULL DEFAULT NULL,
  `legal_completed_at` timestamp NULL DEFAULT NULL,
  `pbg_verified_at` timestamp NULL DEFAULT NULL,
  `slf_verified_at` timestamp NULL DEFAULT NULL,
  `legal_locked_at` timestamp NULL DEFAULT NULL,
  `construction_details` json DEFAULT NULL,
  `construction_completed_at` timestamp NULL DEFAULT NULL,
  `construction_authorized_at` timestamp NULL DEFAULT NULL,
  `construction_locked_at` timestamp NULL DEFAULT NULL,
  `construction_brief_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `construction_brief_revision_notes` text COLLATE utf8mb4_unicode_ci,
  `interior_details` json DEFAULT NULL,
  `interior_locked_at` timestamp NULL DEFAULT NULL,
  `interior_completed_at` timestamp NULL DEFAULT NULL,
  `planning_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `negotiated_fee` decimal(24,2) DEFAULT NULL,
  `payment_instructions` text COLLATE utf8mb4_unicode_ci,
  `planning_submitted_at` timestamp NULL DEFAULT NULL,
  `planning_approved_at` timestamp NULL DEFAULT NULL,
  `planning_pm_verified_at` timestamp NULL DEFAULT NULL,
  `design_payment_verified_at` timestamp NULL DEFAULT NULL,
  `construction_payment_verified_at` timestamp NULL DEFAULT NULL,
  `interior_payment_verified_at` timestamp NULL DEFAULT NULL,
  `arsitek_kickoff_at` timestamp NULL DEFAULT NULL,
  `kontraktor_kickoff_at` timestamp NULL DEFAULT NULL,
  `pm_audit_notes` text COLLATE utf8mb4_unicode_ci,
  `pm_audit_attachments` json DEFAULT NULL,
  `architect_notes` text COLLATE utf8mb4_unicode_ci,
  `planning_iteration` int NOT NULL DEFAULT '0',
  `project_category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `project_dimensions` json DEFAULT NULL,
  `legal_detail` text COLLATE utf8mb4_unicode_ci,
  `wants_to_discuss_later` tinyint(1) NOT NULL DEFAULT '0',
  `legal_requirements` json DEFAULT NULL,
  `share_token` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deadline` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `design_handover_submitted_at` timestamp NULL DEFAULT NULL,
  `construction_handover_submitted_at` timestamp NULL DEFAULT NULL,
  `interior_handover_submitted_at` timestamp NULL DEFAULT NULL,
  `design_handover_notes` text COLLATE utf8mb4_unicode_ci,
  `construction_handover_notes` text COLLATE utf8mb4_unicode_ci,
  `interior_handover_notes` text COLLATE utf8mb4_unicode_ci,
  `legal_handover_submitted_at` timestamp NULL DEFAULT NULL,
  `legal_handover_notes` text COLLATE utf8mb4_unicode_ci,
  `final_walkthrough_at` timestamp NULL DEFAULT NULL,
  `walkthrough_status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `owner_accepted_at` timestamp NULL DEFAULT NULL,
  `owner_acceptance_notes` text COLLATE utf8mb4_unicode_ci,
  `owner_design_approved_at` timestamp NULL DEFAULT NULL,
  `owner_build_approved_at` timestamp NULL DEFAULT NULL,
  `owner_interior_approved_at` timestamp NULL DEFAULT NULL,
  `owner_legal_approved_at` timestamp NULL DEFAULT NULL,
  `warranty_start_at` timestamp NULL DEFAULT NULL,
  `warranty_end_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `projects_share_token_unique` (`share_token`),
  KEY `projects_deleted_at_index` (`deleted_at`),
  KEY `projects_user_id_status_index` (`user_id`,`status`),
  KEY `projects_selected_arsitek_id_index` (`selected_arsitek_id`),
  KEY `projects_selected_kontraktor_id_index` (`selected_kontraktor_id`),
  KEY `projects_selected_notaris_id_index` (`selected_notaris_id`),
  KEY `projects_selected_interior_id_index` (`selected_interior_id`),
  KEY `projects_pm_id_index` (`pm_id`),
  KEY `projects_structural_id_index` (`structural_id`),
  KEY `projects_mep_id_index` (`mep_id`),
  KEY `projects_status_created_at_index` (`status`,`created_at`),
  KEY `projects_target_role_status_idx` (`target_role`,`status`),
  CONSTRAINT `projects_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900078475 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `provinces`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `provinces` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `push_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `push_subscriptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `endpoint` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `p256dh` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `auth` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_encoding` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'aesgcm',
  `user_agent` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `push_subscriptions_endpoint_unique` (`endpoint`),
  KEY `push_subscriptions_user_id_foreign` (`user_id`),
  CONSTRAINT `push_subscriptions_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=263 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `regions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `regions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_province` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `regions_id_province_foreign` (`id_province`),
  CONSTRAINT `regions_id_province_foreign` FOREIGN KEY (`id_province`) REFERENCES `provinces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=93 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `role_has_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_has_permissions` (
  `permission_id` bigint unsigned NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`permission_id`,`role_id`),
  KEY `role_has_permissions_role_id_foreign` (`role_id`),
  CONSTRAINT `role_has_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `role_has_permissions_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `guard_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `roles_name_guard_name_unique` (`name`,`guard_name`)
) ENGINE=InnoDB AUTO_INCREMENT=441 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rooms` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `width` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `length` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `desc` text COLLATE utf8mb4_unicode_ci,
  `id_house` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `rooms_id_house_index` (`id_house`),
  CONSTRAINT `rooms_id_house_foreign` FOREIGN KEY (`id_house`) REFERENCES `house` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900060303 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rooms_pic`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rooms_pic` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dir` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `size` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_room` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `rooms_pic_id_room_index` (`id_room`),
  CONSTRAINT `rooms_pic_id_room_foreign` FOREIGN KEY (`id_room`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900060246 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_activity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `spesialisasi`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spesialisasi` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `nama` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kategori` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sticky_notes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sticky_notes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `phase_context` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` text COLLATE utf8mb4_unicode_ci,
  `position_index` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sticky_notes_project_id_foreign` (`project_id`),
  KEY `sticky_notes_user_id_foreign` (`user_id`),
  CONSTRAINT `sticky_notes_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sticky_notes_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900031751 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `structural_engineers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `structural_engineers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `nama` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `no_telp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rate_harga` decimal(24,2) NOT NULL DEFAULT '0.00',
  `reliability_score` int NOT NULL DEFAULT '100' COMMENT 'Deducted on termination (10) or resignation (5); floored at 0.',
  `spesialisasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deskripsi` text COLLATE utf8mb4_unicode_ci,
  `lokasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pengalaman_tahun` int NOT NULL DEFAULT '0',
  `file_portofolio` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_sertifikat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pendidikan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alasan_hire` text COLLATE utf8mb4_unicode_ci,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identity_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `npwp_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siup_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` enum('individual','company') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'individual',
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_license` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `structural_engineers_user_id_foreign` (`user_id`),
  CONSTRAINT `structural_engineers_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900009800 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suppliers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `store_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `no_telp` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bio` text COLLATE utf8mb4_unicode_ci,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `detail_location` text COLLATE utf8mb4_unicode_ci,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `suppliers_user_id_foreign` (`user_id`),
  KEY `suppliers_verification_created_idx` (`verification_status`,`created_at`),
  CONSTRAINT `suppliers_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900012548 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `team_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `team_members` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `owner_user_id` bigint unsigned NOT NULL,
  `owner_role` enum('arsitek','kontraktor','structural','mep','interior') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `photo_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role_title` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bio` text COLLATE utf8mb4_unicode_ci,
  `skills` json DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_owner_status` (`owner_user_id`,`status`),
  KEY `idx_owner_role` (`owner_user_id`,`owner_role`),
  CONSTRAINT `team_members_owner_user_id_foreign` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=900056336 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_channels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_channels` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `channel` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `destination` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_channels_unique` (`user_id`,`channel`),
  CONSTRAINT `user_channels_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `username` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unique_code` varchar(6) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pic` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firm_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firm_slogan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firm_banner_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firm_description` text COLLATE utf8mb4_unicode_ci,
  `firm_is_hiring` tinyint(1) NOT NULL DEFAULT '0',
  `firm_needed_roles` json DEFAULT NULL,
  `Deskripsi` text COLLATE utf8mb4_unicode_ci,
  `bank_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_account_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_account_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `role_type` enum('user','arsitek','kontraktor','admin','supplier','logistics','notaris','interior','project_manager','structural','mep','civil','mechanical','electrical','plumbing','roofing','finishing') COLLATE utf8mb4_unicode_ci DEFAULT 'user',
  `is_suspended` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  UNIQUE KEY `users_username_unique` (`username`),
  UNIQUE KEY `users_unique_code_unique` (`unique_code`)
) ENGINE=InnoDB AUTO_INCREMENT=900146978 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

