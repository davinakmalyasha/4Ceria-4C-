
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

LOCK TABLES `admin` WRITE;
/*!40000 ALTER TABLE `admin` DISABLE KEYS */;
/*!40000 ALTER TABLE `admin` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `arsitek_ratings` WRITE;
/*!40000 ALTER TABLE `arsitek_ratings` DISABLE KEYS */;
/*!40000 ALTER TABLE `arsitek_ratings` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `arsiteks` WRITE;
/*!40000 ALTER TABLE `arsiteks` DISABLE KEYS */;
INSERT INTO `arsiteks` (`id`, `user_id`, `nama`, `no_telp`, `rate_harga`, `spesialisasi`, `deskripsi`, `lokasi`, `pengalaman_tahun`, `file_portofolio`, `file_sertifikat`, `npwp`, `siup`, `pendidikan`, `alasan_hire`, `verification_status`, `rejection_reason`, `foto`, `identity_number`, `npwp_number`, `siup_number`, `entity_type`, `company_name`, `company_license`, `reliability_score`, `created_at`, `updated_at`) VALUES (6634,31682,'Giska Modern Architecture','08123456789',15000000.00,'Minimalist, Eco-Friendly, Modern','Architectural excellence focused on sustainable and eco-friendly designs with a modern minimalist touch.','Jakarta Selatan',8,'https://example.com/portfolio-giska.pdf',NULL,NULL,NULL,NULL,NULL,'verified',NULL,'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1976&auto=format&fit=crop',NULL,NULL,NULL,'individual',NULL,NULL,100,'2026-10-02 02:20:38','2026-10-02 02:20:38');
/*!40000 ALTER TABLE `arsiteks` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `bid_negotiation_logs` WRITE;
/*!40000 ALTER TABLE `bid_negotiation_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `bid_negotiation_logs` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `bids_arsitek` WRITE;
/*!40000 ALTER TABLE `bids_arsitek` DISABLE KEYS */;
INSERT INTO `bids_arsitek` (`id`, `project_id`, `arsitek_id`, `price`, `price_max`, `negotiation_count`, `fee_type`, `unit_price`, `quantity`, `calculated_total`, `proposal`, `status`, `is_recommended`, `estimated_duration`, `duration_unit`, `attachment_1`, `attachment_2`, `attachment_3`, `payment_status`, `paid_at`, `scopes`, `deliverables`, `style`, `created_at`, `updated_at`, `offered_by_id`, `fee_agreed_at`, `payment_proof_path`, `verification_notes`, `proposed_termins`, `proposed_milestones`, `proposed_team`, `refunded_amount`) VALUES (2587,14976,6634,68000000.00,NULL,0,'fixed',NULL,NULL,NULL,'Demo bid. Concept design, 3D views, and a permit-ready drawing set. Design in 5 weeks, one revision round included.','pending',1,5,'weeks',NULL,NULL,NULL,'unpaid',NULL,NULL,NULL,NULL,'2026-10-02 02:20:39','2026-10-02 02:20:39',31682,NULL,NULL,NULL,NULL,NULL,NULL,0.00);
/*!40000 ALTER TABLE `bids_arsitek` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `bids_interior` WRITE;
/*!40000 ALTER TABLE `bids_interior` DISABLE KEYS */;
INSERT INTO `bids_interior` (`id`, `project_id`, `interior_id`, `price`, `price_max`, `negotiation_count`, `fee_type`, `unit_price`, `quantity`, `calculated_total`, `proposal`, `scopes`, `deliverables`, `style`, `status`, `is_recommended`, `estimated_duration`, `duration_unit`, `payment_status`, `paid_at`, `attachment_1`, `attachment_2`, `attachment_3`, `created_at`, `updated_at`, `offered_by_id`, `fee_agreed_at`, `payment_proof_path`, `verification_notes`, `proposed_termins`, `proposed_milestones`, `refunded_amount`) VALUES (97,14976,377,61000000.00,NULL,0,'fixed',NULL,NULL,NULL,'Demo bid. Space planning, lighting and material selection alongside the architectural set, to keep the interior decisions from stalling the build.',NULL,NULL,NULL,'pending',0,'4','weeks','unpaid',NULL,NULL,NULL,NULL,'2026-10-02 02:20:39','2026-10-29 17:43:33',31684,NULL,NULL,NULL,NULL,NULL,0.00);
/*!40000 ALTER TABLE `bids_interior` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `bids_kontraktor` WRITE;
/*!40000 ALTER TABLE `bids_kontraktor` DISABLE KEYS */;
INSERT INTO `bids_kontraktor` (`id`, `project_id`, `kontraktor_id`, `price`, `price_max`, `negotiation_count`, `fee_type`, `unit_price`, `quantity`, `calculated_total`, `proposal`, `status`, `is_recommended`, `estimated_duration`, `duration_unit`, `attachment_1`, `attachment_2`, `attachment_3`, `construction_method`, `cost_breakdown`, `workforce_count`, `equipment_owned`, `warranty_months`, `payment_preference`, `payment_status`, `paid_at`, `scopes`, `deliverables`, `created_at`, `updated_at`, `offered_by_id`, `fee_agreed_at`, `payment_proof_path`, `verification_notes`, `proposed_termins`, `proposed_milestones`, `proposed_team`, `refunded_amount`) VALUES (962,14976,6544,640000000.00,NULL,0,'fixed',NULL,NULL,NULL,'Demo bid. Full build across two phases, materials quoted per stage, structural and MEP by certified sub-contractors.','pending',0,7,'months',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'unpaid',NULL,NULL,NULL,'2026-10-02 02:20:39','2026-10-02 02:20:39',31683,NULL,NULL,NULL,NULL,NULL,NULL,0.00);
/*!40000 ALTER TABLE `bids_kontraktor` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `bids_mep` WRITE;
/*!40000 ALTER TABLE `bids_mep` DISABLE KEYS */;
/*!40000 ALTER TABLE `bids_mep` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `bids_notaris` WRITE;
/*!40000 ALTER TABLE `bids_notaris` DISABLE KEYS */;
INSERT INTO `bids_notaris` (`id`, `project_id`, `notaris_id`, `price`, `price_max`, `negotiation_count`, `fee_type`, `unit_price`, `quantity`, `calculated_total`, `tax_estimate`, `fee_percentage`, `proposal`, `status`, `is_recommended`, `estimated_duration`, `duration_unit`, `attachment_1`, `attachment_2`, `attachment_3`, `payment_status`, `paid_at`, `selected_services`, `created_at`, `updated_at`, `offered_by_id`, `fee_agreed_at`, `payment_proof_path`, `verification_notes`, `proposed_termins`, `proposed_milestones`, `refunded_amount`) VALUES (97,14975,564,15000000.00,NULL,0,'fixed',NULL,NULL,NULL,50000000.00,NULL,'Legal handling for luxury residential project.','accepted',0,'30','days',NULL,NULL,NULL,'unpaid',NULL,NULL,'2026-10-02 02:20:39','2026-10-02 02:20:39',NULL,NULL,NULL,NULL,NULL,NULL,0.00),(98,14977,564,6500000.00,NULL,0,'fixed',NULL,NULL,NULL,NULL,NULL,'Demo bid. AJPP, deed of sale and the SHM transfer, with the land-certificate check and tax filing handled.','pending',0,'3','weeks',NULL,NULL,NULL,'unpaid',NULL,NULL,'2026-10-02 02:20:39','2026-10-30 02:18:04',31685,NULL,NULL,NULL,NULL,NULL,0.00);
/*!40000 ALTER TABLE `bids_notaris` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `bids_project_manager` WRITE;
/*!40000 ALTER TABLE `bids_project_manager` DISABLE KEYS */;
/*!40000 ALTER TABLE `bids_project_manager` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `bids_structural` WRITE;
/*!40000 ALTER TABLE `bids_structural` DISABLE KEYS */;
/*!40000 ALTER TABLE `bids_structural` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `chat_messages` WRITE;
/*!40000 ALTER TABLE `chat_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `chat_messages` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `contact` WRITE;
/*!40000 ALTER TABLE `contact` DISABLE KEYS */;
/*!40000 ALTER TABLE `contact` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `contractor_subspecialties` WRITE;
/*!40000 ALTER TABLE `contractor_subspecialties` DISABLE KEYS */;
INSERT INTO `contractor_subspecialties` (`id`, `slug`, `label`, `label_id`, `category`, `icon`, `created_at`, `updated_at`) VALUES (1,'roofing','Roofing Specialist','Spesialis Atap','construction','roof','2026-09-29 09:14:33','2026-09-29 09:14:33'),(2,'pool','Pool Builder','Pembangun Kolam','construction','pool','2026-09-29 09:14:33','2026-09-29 09:14:33'),(3,'foundation','Foundation Specialist','Spesialis Pondasi','construction','foundation','2026-09-29 09:14:33','2026-09-29 09:14:33'),(4,'steel_structure','Steel Structure','Struktur Baja','construction','steel','2026-09-29 09:14:33','2026-09-29 09:14:33'),(5,'hvac','HVAC Installer','Instalasi HVAC','mechanical','hvac','2026-09-29 09:14:33','2026-09-29 09:14:33'),(6,'electrical_specialist','Electrical Specialist','Spesialis Listrik','mechanical','electric','2026-09-29 09:14:33','2026-09-29 09:14:33'),(7,'plumbing_specialist','Plumbing Specialist','Spesialis Plumbing','mechanical','plumbing','2026-09-29 09:14:33','2026-09-29 09:14:33'),(8,'waterproofing','Waterproofing','Waterproofing','finishing','water','2026-09-29 09:14:33','2026-09-29 09:14:33'),(9,'glass_facade','Glass & Facade','Kaca & Fasad','finishing','glass','2026-09-29 09:14:33','2026-09-29 09:14:33'),(10,'painting','Painting & Finishing','Pengecatan & Finishing','finishing','paint','2026-09-29 09:14:33','2026-09-29 09:14:33');
/*!40000 ALTER TABLE `contractor_subspecialties` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `conversations` WRITE;
/*!40000 ALTER TABLE `conversations` DISABLE KEYS */;
/*!40000 ALTER TABLE `conversations` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `courier_profiles` WRITE;
/*!40000 ALTER TABLE `courier_profiles` DISABLE KEYS */;
INSERT INTO `courier_profiles` (`id`, `user_id`, `vehicle_type`, `license_plate`, `is_active`, `created_at`, `updated_at`, `verification_status`, `rejection_reason`) VALUES (1,31686,'Pickup Truck (L300)','B 4122 CER',1,'2026-10-02 02:20:38','2026-10-02 02:20:38','pending',NULL);
/*!40000 ALTER TABLE `courier_profiles` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `delivery_jobs` WRITE;
/*!40000 ALTER TABLE `delivery_jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `delivery_jobs` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `dispute_messages` WRITE;
/*!40000 ALTER TABLE `dispute_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `dispute_messages` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `favorites` WRITE;
/*!40000 ALTER TABLE `favorites` DISABLE KEYS */;
/*!40000 ALTER TABLE `favorites` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `firm_members` WRITE;
/*!40000 ALTER TABLE `firm_members` DISABLE KEYS */;
/*!40000 ALTER TABLE `firm_members` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `house` WRITE;
/*!40000 ALTER TABLE `house` DISABLE KEYS */;
/*!40000 ALTER TABLE `house` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `house_answers` WRITE;
/*!40000 ALTER TABLE `house_answers` DISABLE KEYS */;
/*!40000 ALTER TABLE `house_answers` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `house_pic` WRITE;
/*!40000 ALTER TABLE `house_pic` DISABLE KEYS */;
/*!40000 ALTER TABLE `house_pic` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `house_questions` WRITE;
/*!40000 ALTER TABLE `house_questions` DISABLE KEYS */;
/*!40000 ALTER TABLE `house_questions` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `interior_profiles` WRITE;
/*!40000 ALTER TABLE `interior_profiles` DISABLE KEYS */;
INSERT INTO `interior_profiles` (`id`, `user_id`, `nama`, `no_telp`, `foto`, `identity_number`, `npwp_number`, `siup_number`, `entity_type`, `company_name`, `company_license`, `reliability_score`, `file_portofolio`, `file_sertifikat`, `npwp`, `siup`, `spesialisasi`, `deskripsi`, `lokasi`, `pengalaman_tahun`, `rate_harga`, `verification_status`, `rejection_reason`, `created_at`, `updated_at`) VALUES (377,31684,'Abel Chic Interiors','08312345678','https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=1976&auto=format&fit=crop',NULL,NULL,NULL,'individual',NULL,NULL,100,'https://example.com/portfolio-abel.pdf',NULL,NULL,NULL,'Scandinavian, Mid-Century, Industrial','Turning spaces into warm, stylish homes. Specializing in Scandinavian and Mid-century modern interiors.','Tangerang Selatan',5,10000000.00,'verified',NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38');
/*!40000 ALTER TABLE `interior_profiles` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `interior_ratings` WRITE;
/*!40000 ALTER TABLE `interior_ratings` DISABLE KEYS */;
/*!40000 ALTER TABLE `interior_ratings` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `kontraktor_ratings` WRITE;
/*!40000 ALTER TABLE `kontraktor_ratings` DISABLE KEYS */;
/*!40000 ALTER TABLE `kontraktor_ratings` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `kontraktor_spesialisasi` WRITE;
/*!40000 ALTER TABLE `kontraktor_spesialisasi` DISABLE KEYS */;
/*!40000 ALTER TABLE `kontraktor_spesialisasi` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `kontraktors` WRITE;
/*!40000 ALTER TABLE `kontraktors` DISABLE KEYS */;
INSERT INTO `kontraktors` (`id`, `user_id`, `nama`, `no_telepon`, `alamat`, `jenis`, `nama_perusahaan`, `npwp`, `siup`, `pengalaman`, `spesialisasi`, `subspecialties`, `rate_harga`, `pendidikan`, `alasan_hire`, `verification_status`, `rejection_reason`, `foto`, `file_portofolio`, `file_sertifikat`, `identity_number`, `npwp_number`, `siup_number`, `entity_type`, `company_name`, `company_license`, `reliability_score`, `created_at`, `updated_at`) VALUES (6544,31683,'Anindia Build Co.','08212345678','Jl. Pembangunan No. 12, Bandung','General Contractor','PT Anindia Bangun Indonesia',NULL,NULL,12,'Residential, Commercial, Industrial',NULL,50000000.00,NULL,NULL,'verified',NULL,'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=1961&auto=format&fit=crop',NULL,NULL,NULL,NULL,NULL,'individual',NULL,NULL,100,'2026-10-02 02:20:38','2026-10-02 02:20:38'),(6545,31695,'Rudi (Sub-Civil)','08229740891','Jakarta','Sub-Contractor',NULL,NULL,NULL,7,'Foundation, Framing, Columns & Beams',NULL,8534414.00,NULL,NULL,'verified',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'individual',NULL,NULL,100,'2026-10-02 02:20:39','2026-10-02 02:20:39'),(6546,31696,'Dimas (Sub-Mechanical)','08455890988','Jakarta','Sub-Contractor',NULL,NULL,NULL,10,'HVAC, Elevator, Fire Protection',NULL,10809171.00,NULL,NULL,'verified',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'individual',NULL,NULL,100,'2026-10-02 02:20:39','2026-10-02 02:20:39'),(6547,31697,'Wahyu (Sub-Electrical)','08519788700','Jakarta','Sub-Contractor',NULL,NULL,NULL,9,'Power Distribution, Wiring, Panels',NULL,13707806.00,NULL,NULL,'verified',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'individual',NULL,NULL,100,'2026-10-02 02:20:39','2026-10-02 02:20:39'),(6548,31698,'Hendra (Sub-Plumbing)','08449758229','Jakarta','Sub-Contractor',NULL,NULL,NULL,8,'Water Supply, Drainage, Sewage',NULL,8180640.00,NULL,NULL,'verified',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'individual',NULL,NULL,100,'2026-10-02 02:20:39','2026-10-02 02:20:39'),(6549,31699,'Teguh (Sub-Roofing)','08576063183','Jakarta','Sub-Contractor',NULL,NULL,NULL,6,'Roof Truss, Covering, Waterproofing',NULL,13332381.00,NULL,NULL,'verified',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'individual',NULL,NULL,100,'2026-10-02 02:20:39','2026-10-02 02:20:39'),(6550,31700,'Agus (Sub-Finishing)','08738788467','Jakarta','Sub-Contractor',NULL,NULL,NULL,8,'Plastering, Painting, Tiling, Facade',NULL,5432190.00,NULL,NULL,'verified',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'individual',NULL,NULL,100,'2026-10-02 02:20:39','2026-10-02 02:20:39');
/*!40000 ALTER TABLE `kontraktors` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `material_images` WRITE;
/*!40000 ALTER TABLE `material_images` DISABLE KEYS */;
/*!40000 ALTER TABLE `material_images` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `material_order_items` WRITE;
/*!40000 ALTER TABLE `material_order_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `material_order_items` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `material_order_reviews` WRITE;
/*!40000 ALTER TABLE `material_order_reviews` DISABLE KEYS */;
/*!40000 ALTER TABLE `material_order_reviews` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `material_orders` WRITE;
/*!40000 ALTER TABLE `material_orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `material_orders` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `material_quotes` WRITE;
/*!40000 ALTER TABLE `material_quotes` DISABLE KEYS */;
/*!40000 ALTER TABLE `material_quotes` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `materials` WRITE;
/*!40000 ALTER TABLE `materials` DISABLE KEYS */;
INSERT INTO `materials` (`id`, `supplier_id`, `name`, `description`, `price`, `unit`, `category`, `stock`, `is_available`, `image_path`, `specifications`, `created_at`, `updated_at`) VALUES (272,1093,'Luxurious Scandinavian Grey Sofa','A luxurious 3-seater sofa with premium velvet finish and solid oak legs.',7500000.00,'piece','Furniture',10,1,'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=2070&auto=format&fit=crop','{\"Material\": \"Velvet, Solid Wood\", \"Dimensions\": \"220 x 90 x 85 cm\"}','2026-10-02 02:20:38','2026-10-02 02:20:38'),(273,1093,'Minimalist Coffee Table Set','Real Carrara marble top with industrial steel frame.',3200000.00,'piece','Furniture',5,1,'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?q=80&w=2069&auto=format&fit=crop','{\"Material\": \"Marble, Steel\", \"Dimensions\": \"100 x 60 x 45 cm\"}','2026-10-02 02:20:38','2026-11-01 21:15:04');
/*!40000 ALTER TABLE `materials` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `mep_engineers` WRITE;
/*!40000 ALTER TABLE `mep_engineers` DISABLE KEYS */;
INSERT INTO `mep_engineers` (`id`, `user_id`, `nama`, `no_telp`, `rate_harga`, `reliability_score`, `spesialisasi`, `deskripsi`, `lokasi`, `pengalaman_tahun`, `file_portofolio`, `file_sertifikat`, `npwp`, `siup`, `pendidikan`, `alasan_hire`, `verification_status`, `rejection_reason`, `foto`, `identity_number`, `npwp_number`, `siup_number`, `entity_type`, `company_name`, `company_license`, `created_at`, `updated_at`) VALUES (591,31691,'Andi MEP Solutions','08612345678',8000000.00,100,'Electrical, Plumbing, HVAC','Comprehensive MEP engineering for modern smart homes.','Surabaya',7,NULL,NULL,NULL,NULL,NULL,NULL,'verified',NULL,NULL,NULL,NULL,NULL,'individual',NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38');
/*!40000 ALTER TABLE `mep_engineers` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (1,'0001_01_01_000000_create_users_table',1),(2,'0001_01_01_000001_create_cache_table',1),(3,'0001_01_01_000002_create_jobs_table',1),(4,'2024_11_05_141213_create_permission_tables',1),(5,'2025_03_15_101457_create_arsiteks_table',1),(6,'2025_03_19_142734_create_kontraktors_table',1),(7,'2025_03_19_155941_create_projects_table',1),(8,'2025_03_19_155942_create_bids_arsiteks_table',1),(9,'2025_03_19_155942_create_bids_kontraktors_table',1),(10,'2026_03_23_071108_create_personal_access_tokens_table',1),(11,'2026_03_24_014924_create_project_images_table',1),(12,'2026_04_01_030443_create_project_milestones_table',1),(13,'2026_04_01_030444_create_project_comments_table',1),(14,'2026_04_01_030444_create_project_documents_table',1),(15,'2026_04_01_033621_alter_status_enum_in_projects_table',1),(16,'2026_04_01_111530_add_rich_profile_fields_to_professionals',1),(17,'2026_04_01_124510_add_target_role_to_projects_table',1),(18,'2026_04_01_134942_fix_bids_foreign_keys',1),(19,'2026_04_01_141958_create_notifications_table',1),(20,'2026_04_01_142247_add_verification_fields_to_professionals_table',1),(21,'2026_04_02_011230_fix_projects_selected_foreign_keys',1),(22,'2026_04_02_034518_add_duration_and_attachments_to_bids',1),(23,'2026_04_02_043406_create_ratings_tables',1),(24,'2026_04_02_095940_add_type_to_rooms_table',1),(25,'2026_04_02_104500_add_duration_and_attachments_to_bids',1),(26,'2026_04_02_170557_add_location_fields_to_projects_table',1),(27,'2026_04_03_022600_create_conversations_table',1),(28,'2026_04_03_022601_create_chat_messages_table',1),(29,'2026_04_04_042525_update_user_roles_add_supplier_and_logistik',1),(30,'2026_04_04_043234_create_suppliers_table',1),(31,'2026_04_04_043235_create_materials_table',1),(32,'2026_04_04_043236_create_material_orders_table',1),(33,'2026_04_04_043237_create_material_order_items_table',1),(34,'2026_04_04_072755_create_material_quotes_table',1),(35,'2026_04_04_074940_create_material_images_table',1),(36,'2026_04_04_155515_create_delivery_jobs_table',1),(37,'2026_04_04_213037_create_material_order_reviews_table',1),(38,'2026_04_05_054217_create_courier_profiles_table',1),(39,'2026_04_05_054534_update_users_role_type_for_logistics',1),(40,'2026_04_05_153802_create_project_requirements_table',1),(41,'2026_04_11_100001_add_notaris_and_interior_roles',1),(42,'2026_04_11_100002_create_notaris_profiles_table',1),(43,'2026_04_11_100003_create_interior_profiles_table',1),(44,'2026_04_11_100004_create_bids_notaris_table',1),(45,'2026_04_11_100005_create_bids_interior_table',1),(46,'2026_04_11_100006_add_new_phase_columns_to_projects',1),(47,'2026_04_12_121542_create_notaris_services_table',1),(48,'2026_04_12_121543_create_notaris_consultations_table',1),(49,'2026_04_12_213917_add_design_details_to_projects',1),(50,'2026_04_13_033718_add_completed_phases_to_projects_table',1),(51,'2026_04_13_194235_add_handover_features_to_projects_and_requirements',1),(52,'2026_04_13_220118_add_construction_fields_to_projects',1),(53,'2026_04_13_220118_create_project_daily_logs_table',1),(54,'2026_04_13_220119_create_project_payment_termins_table',1),(55,'2026_04_13_230718_add_phase_lock_timestamps_to_projects_table',1),(56,'2026_04_14_000001_add_share_token_to_projects_table',1),(57,'2026_04_14_051700_add_contractor_bid_fields_to_bids_kontraktor',1),(58,'2026_04_14_085653_add_payment_tracking_to_bids_table',1),(59,'2026_04_14_085654_create_project_addendums_table',1),(60,'2026_04_14_085655_create_project_budget_transactions_table',1),(61,'2026_04_14_085656_create_project_budget_sandbox_table',1),(62,'2026_04_14_110000_add_interior_and_phase_context_fields',1),(63,'2026_04_14_190227_add_enterprise_roles_to_users_table',1),(64,'2026_04_14_190246_add_enterprise_fields_to_projects_table',1),(65,'2026_04_14_190305_create_enterprise_profiles_tables',1),(66,'2026_04_15_000001_create_bids_project_manager_table',1),(67,'2026_04_15_203910_add_structured_columns_to_professional_bids',1),(68,'2026_04_16_013403_update_planning_status_enum_in_projects',1),(69,'2026_04_16_014802_add_pm_audit_fields_to_projects',1),(70,'2026_04_16_015632_add_architect_notes_to_projects',1),(71,'2026_04_16_044500_add_requires_mep_to_projects_table',1),(72,'2026_04_16_052000_update_project_planning_workflow',1),(73,'2026_04_16_061939_add_planning_iteration_to_projects_table',1),(74,'2026_04_16_121246_add_project_category_and_dimensions_to_projects_table',1),(75,'2026_04_16_135103_add_legal_requirements_to_projects_and_fee_percentage_to_bids',1),(76,'2026_04_16_231621_increase_amount_precision_in_financial_tables',1),(77,'2026_04_17_000001_create_extended_ratings_tables',1),(78,'2026_04_17_999998_restore_remaining_legacy_tables',1),(79,'2026_04_17_999999_restore_legacy_tables',1),(80,'2026_04_19_232807_add_fee_scopes_deliverables_to_bids_project_manager_table',1),(81,'2026_04_19_234907_create_project_external_vendors_table',1),(82,'2026_04_19_234921_add_published_bidding_roles_to_projects_table',1),(83,'2026_04_20_001621_add_category_and_status_to_project_documents_table',1),(84,'2026_04_20_030903_add_flexible_fee_columns_to_bids_tables',1),(85,'2026_04_20_130408_add_role_info_to_project_payment_termins_table',1),(86,'2026_04_21_001325_create_engineering_bids_tables',1),(87,'2026_04_21_010703_add_legal_timestamps_to_projects_table',1),(88,'2026_04_21_071834_add_recommended_bid_to_project_addendums_table',1),(89,'2026_04_21_112954_sync_project_requirements_schema',1),(90,'2026_04_21_120000_add_engineering_integration_fields',1),(91,'2026_04_21_174823_add_legal_gates_to_projects_table',1),(92,'2026_04_21_181114_add_construction_brief_status_to_projects_table',1),(93,'2026_04_21_184413_add_missing_columns_to_financial_tables',1),(94,'2026_04_22_045108_create_project_procurement_requests_table',1),(95,'2026_04_22_045109_add_procurement_request_id_to_project_addendums_table',1),(96,'2026_04_22_084929_add_handover_verification_to_projects',1),(97,'2026_04_23_052943_add_structured_fields_to_professional_bids_table',1),(98,'2026_04_23_154223_add_legal_handover_to_projects',1),(99,'2026_04_23_174643_create_project_snag_items_table',1),(100,'2026_04_23_174651_create_project_change_orders_table',1),(101,'2026_04_23_174652_add_handover_and_owner_fields_to_projects_table',1),(102,'2026_04_24_012525_add_retention_to_payment_termins',1),(103,'2026_04_24_012530_create_project_warranty_claims',1),(104,'2026_04_24_012534_create_project_timeline_extensions',1),(105,'2026_04_24_023052_add_category_to_project_requirements',1),(106,'2026_04_24_023057_add_version_label_to_project_documents',1),(107,'2026_04_24_032624_add_resolution_photos_to_project_snag_items',1),(108,'2026_04_24_064934_create_p_m_ratings_table',1),(109,'2026_04_24_065034_add_reliability_score_to_professional_profiles',1),(110,'2026_04_25_235819_add_owner_legal_approved_at_to_projects',1),(111,'2026_04_26_005435_add_payment_verification_dates_to_projects',1),(112,'2026_04_26_074248_add_legal_details_to_projects_table',1),(113,'2026_04_26_081626_add_project_manager_to_external_vendors_phase_role',1),(114,'2026_04_26_082840_add_bidding_choices_to_projects_table',1),(115,'2026_04_26_231814_create_project_reports_table',1),(116,'2026_04_27_014141_create_project_schedules_table',1),(117,'2026_04_27_015456_add_phase_slug_to_project_reports_table',1),(118,'2026_04_29_071251_add_bank_details_to_users_table',1),(119,'2026_04_29_071305_add_proof_of_transfer_to_payment_tables',1),(120,'2026_04_29_150000_add_shortlisted_status_to_bids_tables',1),(121,'2026_04_30_120000_add_negotiation_to_bids_tables',1),(122,'2026_05_01_023100_add_negotiation_count_to_bids_tables',1),(123,'2026_05_01_054319_add_payment_fields_to_bid_tables',1),(124,'2026_05_04_063547_add_missing_statuses_to_bids_enums',1),(125,'2026_05_05_101710_add_interview_fields_to_engineering_bids',1),(126,'2026_05_07_023458_add_professional_fields_to_engineering_bids_table',1),(127,'2026_05_07_023557_add_technical_notes_to_engineering_bids_table',1),(128,'2026_05_07_060001_add_entity_type_to_professional_tables',1),(129,'2026_05_07_060002_create_contractor_subspecialties_table',1),(130,'2026_05_07_060003_create_project_sub_professionals_table',1),(131,'2026_05_07_060004_add_subspecialties_to_kontraktors_table',1),(132,'2026_05_08_060807_enhance_sub_professional_workflow',1),(133,'2026_05_09_000001_add_specialist_ids_to_milestones',1),(134,'2026_05_09_064513_add_lead_pro_verified_at_to_project_milestones',1),(135,'2026_05_09_071417_add_review_fields_to_technical_tables',1),(136,'2026_05_09_121450_create_sticky_notes_table',1),(137,'2026_05_10_103634_add_proposed_termins_to_bids_tables',1),(138,'2026_05_10_103712_create_professional_portfolios_table',1),(139,'2026_05_10_171000_add_negotiation_fields_to_bids_project_manager',1),(140,'2026_05_10_212746_create_bid_negotiation_logs_table',1),(141,'2026_05_11_075006_add_awaiting_payment_to_projects_status',1),(142,'2026_05_12_045134_add_kickoff_gates_to_projects_table',1),(143,'2026_05_15_000001_add_verification_notes_to_payments',1),(144,'2026_05_15_122209_add_milestone_id_and_role_type_to_project_change_orders_table',1),(145,'2026_05_15_181112_create_team_members_table',1),(146,'2026_05_16_000001_add_proposed_team_to_bid_tables',1),(147,'2026_05_16_050305_update_project_external_vendors_table_add_team_member_id_and_notes',1),(148,'2026_05_16_065744_add_specialist_assignment_to_project_addendums_table',1),(149,'2026_05_16_073918_add_negotiation_to_project_addendums_table',1),(150,'2026_05_17_000001_add_unique_code_to_users',1),(151,'2026_05_17_000001_fix_project_addendums_status_enum',1),(152,'2026_05_17_000002_create_firm_members_table',1),(153,'2026_05_17_142853_add_versioning_to_project_documents_table',1),(154,'2026_05_17_163200_add_title_to_sticky_notes_table',1),(155,'2026_05_17_171905_add_requested_at_to_firm_members_table',1),(156,'2026_05_17_181131_add_assigned_user_id_to_project_addendums_table',1),(157,'2026_05_18_024500_add_requires_interior_to_projects_table',1),(158,'2026_05_18_060000_refine_project_requirements',1),(159,'2026_05_18_071500_add_price_max_to_bids_tables',1),(160,'2026_05_18_114552_add_author_and_purpose_to_project_requirements_table',1),(161,'2026_05_18_120752_add_estimated_unit_cost_to_project_requirements_table',1),(162,'2026_05_18_123540_create_project_material_folders_table',1),(163,'2026_05_18_123549_add_folder_id_to_project_requirements_table',1),(164,'2026_05_18_132019_add_bom_type_to_project_material_folders_table',1),(165,'2026_05_18_155006_update_firm_members_unique_index',1),(166,'2026_05_18_155100_add_sub_contractor_role_types_to_users_table',1),(167,'2026_05_18_202203_add_pm_authorization_to_projects_table',1),(168,'2026_05_19_000000_add_estimated_unit_cost_to_project_procurement_requests_table',1),(169,'2026_05_23_000000_add_soft_deletes_to_projects_table',1),(170,'2026_05_23_000001_create_project_terminations_table',1),(171,'2026_05_26_074500_add_parent_id_to_project_comments_table',1),(172,'2026_05_26_181558_add_suspension_status_to_tables',1),(173,'2026_05_26_222137_add_verification_status_to_courier_profiles_table',1),(174,'2026_05_27_000000_standardize_verification_fields',1),(175,'2026_05_28_025139_add_alasan_hire_to_enterprise_tables',1),(176,'2026_06_02_232610_add_is_recommended_to_bids_tables',1),(177,'2026_06_04_015011_add_attachments_to_bids_project_manager_table',1),(178,'2026_06_04_020000_add_firm_profile_fields_to_users_table',1),(179,'2026_06_04_023000_add_hiring_fields_to_users_table',1),(180,'2026_06_04_163100_modify_firm_members_status_enum',1),(181,'2026_06_07_071130_add_materials_authorization_to_projects_table',1),(182,'2026_06_08_143730_add_performance_indexes_to_core_tables',1),(183,'2026_06_26_000001_create_house_questions_table',1),(184,'2026_06_27_000001_add_rejection_reason_to_bids',1),(185,'2026_06_28_000000_add_description_to_project_documents_table',1),(186,'2026_06_28_000001_add_image_to_chat_messages_table',1),(187,'2026_08_24_000001_create_project_disbursements_table',1),(188,'2026_08_24_100001_add_missing_performance_indexes',1),(189,'2026_08_24_100002_add_unique_constraints_for_money_integrity',1),(190,'2026_08_25_000001_drop_dead_legacy_tables',1),(191,'2026_08_25_000001_normalize_ledger_reference_models',1),(192,'2026_09_22_000001_add_walkthrough_status_to_projects_table',1),(193,'2026_09_22_000002_add_shift_tracking_to_project_schedules_table',1),(194,'2026_09_22_000003_create_favorites_table',1),(195,'2026_09_22_000004_add_sla_tracking_to_project_snag_items_table',1),(196,'2026_09_22_000005_create_push_subscriptions_table',1),(197,'2026_09_22_000006_create_project_disputes_table',1),(198,'2026_09_22_000007_create_dispute_messages_table',1),(199,'2026_09_23_000001_add_termination_pending_to_projects_status',1),(200,'2026_09_23_000002_enable_partial_refunds',1),(201,'2026_09_23_000003_link_payment_stages_to_change_orders',1),(202,'2026_09_23_000004_create_notification_preferences',1),(203,'2026_09_23_000010_add_hot_path_indexes',1),(204,'2026_09_29_000001_restore_columns_lost_to_noop_migrations',1),(205,'2026_09_29_000002_normalise_money_columns',1),(206,'2026_09_29_000003_allow_multiple_refunds_per_payment',1),(207,'2026_09_29_000004_add_terminated_status_to_bids',1),(209,'2026_09_29_000005_extend_sub_professionals_parent_role',2),(210,'2026_09_29_000006_migrate_disbursements_to_payment_termins',3),(211,'2026_09_29_000007_drop_project_disbursements',3),(212,'2026_09_29_000008_add_reliability_score_to_specialist_profiles',4),(213,'2026_09_29_000009_add_payment_proof_to_material_quotes',5),(214,'2026_09_29_000010_add_actor_to_budget_transactions',6),(216,'2026_10_01_000011_add_order_and_team_enum_values',7),(217,'2026_10_01_000012_add_retention_release_bookkeeping',8),(218,'2026_10_01_000013_add_platform_fee_transaction_type',9),(219,'2026_10_01_000014_add_list_query_indexes',10),(220,'2026_10_01_000015_add_retention_release_and_material_refund_enums',11),(221,'2026_10_01_000016_drop_duplicate_bid_payment_status_indexes',12),(222,'2026_10_20_000001_canonicalise_ledger_references',13),(223,'2026_10_21_000001_resolve_projects_pm_id_to_a_profile_id',14),(224,'2026_10_21_000002_add_refunded_to_project_addendums_status',15),(225,'2026_10_21_000003_restore_dropped_enum_defaults',16),(226,'2026_10_21_000004_add_completed_at_to_projects',17),(227,'2026_10_31_000001_add_planning_pm_verified_at_to_projects',18),(228,'2026_11_02_000001_add_recommended_to_enum_bid_statuses',19);
/*!40000 ALTER TABLE `migrations` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `model_has_permissions` WRITE;
/*!40000 ALTER TABLE `model_has_permissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `model_has_permissions` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `model_has_roles` WRITE;
/*!40000 ALTER TABLE `model_has_roles` DISABLE KEYS */;
INSERT INTO `model_has_roles` (`role_id`, `model_type`, `model_id`) VALUES (417,'App\\Models\\User',31682),(418,'App\\Models\\User',31683),(2,'App\\Models\\User',31684),(1,'App\\Models\\User',31685),(416,'App\\Models\\User',31686),(416,'App\\Models\\User',31687),(419,'App\\Models\\User',31688),(419,'App\\Models\\User',31689),(421,'App\\Models\\User',31690),(420,'App\\Models\\User',31691),(416,'App\\Models\\User',31692),(416,'App\\Models\\User',31693),(415,'App\\Models\\User',31694),(422,'App\\Models\\User',31695),(423,'App\\Models\\User',31696),(424,'App\\Models\\User',31697),(425,'App\\Models\\User',31698),(426,'App\\Models\\User',31699),(427,'App\\Models\\User',31700);
/*!40000 ALTER TABLE `model_has_roles` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `notaris_consultations` WRITE;
/*!40000 ALTER TABLE `notaris_consultations` DISABLE KEYS */;
/*!40000 ALTER TABLE `notaris_consultations` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `notaris_profiles` WRITE;
/*!40000 ALTER TABLE `notaris_profiles` DISABLE KEYS */;
INSERT INTO `notaris_profiles` (`id`, `user_id`, `nama`, `no_telp`, `foto`, `file_portofolio`, `identity_number`, `npwp_number`, `siup_number`, `entity_type`, `company_name`, `company_license`, `reliability_score`, `nomor_sk`, `wilayah_kerja`, `spesialisasi`, `deskripsi`, `lokasi`, `pengalaman_tahun`, `rate_harga`, `file_sertifikat`, `npwp`, `siup`, `verification_status`, `rejection_reason`, `created_at`, `updated_at`) VALUES (564,31685,'Notaris Rede, S.H., M.Kn.','08412345678','https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=1974&auto=format&fit=crop',NULL,NULL,NULL,NULL,'individual',NULL,NULL,100,'SK-2023-NOT-999','DKI Jakarta','Property Law, Corporate Law','Specialist in property law and large-scale land acquisition.','Jakarta Pusat',15,5000000.00,NULL,NULL,NULL,'verified',NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38');
/*!40000 ALTER TABLE `notaris_profiles` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `notaris_ratings` WRITE;
/*!40000 ALTER TABLE `notaris_ratings` DISABLE KEYS */;
/*!40000 ALTER TABLE `notaris_ratings` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `notaris_services` WRITE;
/*!40000 ALTER TABLE `notaris_services` DISABLE KEYS */;
INSERT INTO `notaris_services` (`id`, `notaris_id`, `title`, `price`, `description`, `created_at`, `updated_at`) VALUES (1,564,'AJB & Balik Nama',5000000.00,'Professional handling of Akta Jual Beli and transfer of title with BPN.','2026-11-02 05:13:32','2026-11-02 05:13:32'),(2,564,'PBG (IMB) Permit',7500000.00,'Complete processing of Building Approval (PBG/IMB) according to local regulations.','2026-11-02 05:13:32','2026-11-02 05:13:32'),(3,564,'SLF Certification',3000000.00,'Certificate of Functional Worth (SLF) verification and processing for property legality.','2026-11-02 05:13:32','2026-11-02 05:13:32');
/*!40000 ALTER TABLE `notaris_services` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `notification_preferences` WRITE;
/*!40000 ALTER TABLE `notification_preferences` DISABLE KEYS */;
/*!40000 ALTER TABLE `notification_preferences` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` (`id`, `user_id`, `type`, `title`, `body`, `data`, `read_at`, `created_at`, `updated_at`) VALUES (900058459,31682,'payment_verified','Payment Verified','Your Rp 2.000.000 payment for \"Arsitek bid\" on \"Modern Minimalist Villa in Ubud\" has been verified.','{\"payment_id\": 900012797, \"project_id\": 14970, \"payment_type\": \"arsitek_bid\"}',NULL,'2026-10-29 11:57:06','2026-10-29 11:57:06'),(900058460,31694,'payment_verified','Payment Confirmed','The Rp 2.000.000 payment for \"Arsitek bid\" has been confirmed by the payer.','{\"payment_id\": 900012797, \"project_id\": 14970, \"payment_type\": \"arsitek_bid\"}',NULL,'2026-10-29 11:57:06','2026-10-29 11:57:06'),(900058464,31682,'payment_verified','Payment Verified','Your Rp 2.000.000 payment for \"Arsitek bid\" on \"Modern Minimalist Villa in Ubud\" has been verified.','{\"payment_id\": 900012797, \"project_id\": 14970, \"payment_type\": \"arsitek_bid\"}',NULL,'2026-10-29 11:57:44','2026-10-29 11:57:44'),(900058465,31694,'payment_verified','Payment Confirmed','The Rp 2.000.000 payment for \"Arsitek bid\" has been confirmed by the payer.','{\"payment_id\": 900012797, \"project_id\": 14970, \"payment_type\": \"arsitek_bid\"}',NULL,'2026-10-29 11:57:44','2026-10-29 11:57:44'),(900058469,31682,'payment_verified','Payment Verified','Your Rp 2.000.000 payment for \"Arsitek bid\" on \"Modern Minimalist Villa in Ubud\" has been verified.','{\"payment_id\": 900012797, \"project_id\": 14970, \"payment_type\": \"arsitek_bid\"}',NULL,'2026-10-29 12:01:33','2026-10-29 12:01:33'),(900058470,31694,'payment_verified','Payment Confirmed','The Rp 2.000.000 payment for \"Arsitek bid\" has been confirmed by the payer.','{\"payment_id\": 900012797, \"project_id\": 14970, \"payment_type\": \"arsitek_bid\"}',NULL,'2026-10-29 12:01:33','2026-10-29 12:01:33'),(900122380,31692,'dispute_reply','New Dispute Message','System Admin replied on dispute \"Parity admin dispute\" (Demo: Two-storey house - design and build open for bids).','{\"dispute_id\": 900123010, \"project_id\": 14976}',NULL,'2026-11-01 23:58:03','2026-11-01 23:58:03'),(900122383,31692,'dispute_resolved','Dispute Resolved','Dispute \"Parity admin dispute\" on \"Demo: Two-storey house - design and build open for bids\" was closed (dismiss). Payments are unfrozen.','{\"dispute_id\": 900123010, \"project_id\": 14976}',NULL,'2026-11-01 23:58:04','2026-11-01 23:58:04'),(900122386,31682,'verification','Account Verification Rejected','Your request to join as a Arsitek has been rejected. Reason: Parity admin rejection','{\"reason\": \"Parity admin rejection\", \"status\": \"rejected\", \"professional_type\": \"arsitek\"}',NULL,'2026-11-01 23:58:04','2026-11-01 23:58:04'),(900122387,31682,'verification','Account Verification Approved','Your request to join as a Arsitek has been approved! You can now access professional features.','{\"reason\": null, \"status\": \"verified\", \"professional_type\": \"arsitek\"}',NULL,'2026-11-01 23:58:04','2026-11-01 23:58:04');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `p_m_ratings` WRITE;
/*!40000 ALTER TABLE `p_m_ratings` DISABLE KEYS */;
/*!40000 ALTER TABLE `p_m_ratings` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
INSERT INTO `permissions` (`id`, `name`, `guard_name`, `created_at`, `updated_at`) VALUES (1,'user-edit','web','2026-10-02 02:20:37','2026-10-02 02:20:37'),(2,'user-view','web','2026-10-02 02:20:37','2026-10-02 02:20:37'),(3,'house-view','web','2026-10-02 02:20:37','2026-10-02 02:20:37'),(4,'house-detail','web','2026-10-02 02:20:37','2026-10-02 02:20:37');
/*!40000 ALTER TABLE `permissions` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `phone_user` WRITE;
/*!40000 ALTER TABLE `phone_user` DISABLE KEYS */;
INSERT INTO `phone_user` (`id`, `contact`, `id_user`, `id_contact`) VALUES (8973,'+62-800-shadow',31692,NULL);
/*!40000 ALTER TABLE `phone_user` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `professional_portfolios` WRITE;
/*!40000 ALTER TABLE `professional_portfolios` DISABLE KEYS */;
/*!40000 ALTER TABLE `professional_portfolios` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_activity_logs` WRITE;
/*!40000 ALTER TABLE `project_activity_logs` DISABLE KEYS */;
INSERT INTO `project_activity_logs` (`id`, `project_id`, `user_id`, `action`, `details`, `created_at`, `updated_at`) VALUES (900047949,14975,31692,'requirement_added','Added material: Procurement Fixture','2026-10-29 23:27:45','2026-10-29 23:27:45'),(900047950,14975,31692,'procurement_requested','Requested procurement for Procurement Fixture (1 pcs)','2026-10-29 23:27:45','2026-10-29 23:27:45'),(900093490,14976,31692,'specialist_requested','Architect requested specialist coordination for: Structural. Description: Parity engineering request','2026-11-01 05:53:26','2026-11-01 05:53:26'),(900093491,14976,31692,'engineering_request_verified','PM approved specialist request for: Structural','2026-11-01 05:54:33','2026-11-01 05:54:33'),(900093492,14976,31692,'specialist_requested','Architect requested specialist coordination for: Mep. Description: Parity engineering reject','2026-11-01 05:54:35','2026-11-01 05:54:35'),(900093493,14976,31692,'engineering_request_verified','PM rejected specialist request for: Mep','2026-11-01 05:54:35','2026-11-01 05:54:35'),(900094695,14976,31694,'dispute_resolved','Sengketa \"Parity admin dispute\" ditolak/di-dismiss oleh System Admin. Pembayaran dicabut pembekuannya.','2026-11-01 23:58:04','2026-11-01 23:58:04');
/*!40000 ALTER TABLE `project_activity_logs` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_addendums` WRITE;
/*!40000 ALTER TABLE `project_addendums` DISABLE KEYS */;
INSERT INTO `project_addendums` (`id`, `project_id`, `type`, `role_type`, `user_id`, `team_member_id`, `specialist_type`, `title`, `description`, `negotiation_note`, `attachment_path`, `amount`, `counter_offer_amount`, `recommended_bid_id`, `recommended_bid_type`, `status`, `payment_proof_path`, `verification_notes`, `paid_at`, `created_at`, `updated_at`, `procurement_request_id`, `assigned_user_id`, `refunded_amount`) VALUES (934,14975,'extra_fee','notaris',31685,NULL,NULL,'[Legal Disbursement] Biaya PNBP Hak Atas Tanah','Payment for land registration PNBP fees.',NULL,NULL,5500000.00,NULL,NULL,NULL,'paid',NULL,NULL,'2026-10-01 03:07:54','2026-10-02 02:20:39','2026-10-02 03:07:54',NULL,NULL,0.00),(935,14975,'extra_fee','notaris',31685,NULL,NULL,'[Legal Disbursement] Biaya Pajak BPHTB (Estimasi)','Estimated tax for BPHTB based on deal value.',NULL,NULL,45000000.00,NULL,NULL,NULL,'pending_approval',NULL,NULL,NULL,'2026-10-02 02:20:39','2026-10-30 12:52:39',NULL,NULL,0.00);
/*!40000 ALTER TABLE `project_addendums` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_budget_sandbox` WRITE;
/*!40000 ALTER TABLE `project_budget_sandbox` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_budget_sandbox` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_budget_transactions` WRITE;
/*!40000 ALTER TABLE `project_budget_transactions` DISABLE KEYS */;
INSERT INTO `project_budget_transactions` (`id`, `project_id`, `transaction_type`, `amount`, `title`, `category`, `type`, `status`, `description`, `reference_model`, `reference_id`, `reverses_model`, `reverses_id`, `transaction_date`, `actor_user_id`, `actor_role`, `voided_at`, `voided_duplicate_of_id`, `voided_original_amount`, `created_at`, `updated_at`) VALUES (5619,14975,'payment',0.00,'[VOIDED — duplicate ledger reference #5918] [Legal Disbursement] Biaya PNBP Hak Atas Tanah',NULL,NULL,NULL,NULL,'App\\Models\\ProjectAddendum',NULL,NULL,NULL,'2026-10-01 02:20:39',NULL,NULL,'2026-10-20 08:05:57',5918,5500000.00,'2026-10-02 02:20:39','2026-10-02 02:20:39'),(5918,14975,'payment',5500000.00,'[Legal Disbursement] Biaya PNBP Hak Atas Tanah',NULL,NULL,NULL,NULL,'App\\Models\\ProjectAddendum',934,NULL,NULL,'2026-10-01 03:07:54',NULL,NULL,NULL,NULL,NULL,'2026-10-02 03:07:54','2026-10-02 03:07:54');
/*!40000 ALTER TABLE `project_budget_transactions` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_change_orders` WRITE;
/*!40000 ALTER TABLE `project_change_orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_change_orders` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_comments` WRITE;
/*!40000 ALTER TABLE `project_comments` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_comments` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_daily_logs` WRITE;
/*!40000 ALTER TABLE `project_daily_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_daily_logs` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_delays` WRITE;
/*!40000 ALTER TABLE `project_delays` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_delays` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_disputes` WRITE;
/*!40000 ALTER TABLE `project_disputes` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_disputes` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_documents` WRITE;
/*!40000 ALTER TABLE `project_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_documents` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_external_vendors` WRITE;
/*!40000 ALTER TABLE `project_external_vendors` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_external_vendors` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_images` WRITE;
/*!40000 ALTER TABLE `project_images` DISABLE KEYS */;
INSERT INTO `project_images` (`id`, `project_id`, `image_path`, `sort_order`, `created_at`, `updated_at`) VALUES (1,14970,'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=2070&auto=format&fit=crop',0,'2026-10-02 02:20:38','2026-10-02 02:20:38'),(2,14970,'https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=2071&auto=format&fit=crop',1,'2026-10-02 02:20:38','2026-10-02 02:20:38'),(3,14971,'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=2070&auto=format&fit=crop',0,'2026-10-02 02:20:38','2026-10-02 02:20:38'),(4,14972,'https://images.unsplash.com/photo-1503387762-592dea58ef23?q=80&w=2070&auto=format&fit=crop',0,'2026-10-02 02:20:38','2026-10-02 02:20:38'),(5,14972,'https://images.unsplash.com/photo-1541888946425-d81bb19480c5?q=80&w=2070&auto=format&fit=crop',1,'2026-10-02 02:20:38','2026-10-02 02:20:38'),(6,14973,'https://images.unsplash.com/photo-1583847268964-b28dc2f51ac9?q=80&w=1974&auto=format&fit=crop',0,'2026-10-02 02:20:38','2026-10-02 02:20:38'),(7,14973,'https://images.unsplash.com/photo-1594026112284-02bb6f3352fe?q=80&w=2070&auto=format&fit=crop',1,'2026-10-02 02:20:38','2026-10-02 02:20:38'),(8,14974,'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop',0,'2026-10-02 02:20:38','2026-10-02 02:20:38');
/*!40000 ALTER TABLE `project_images` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_managers` WRITE;
/*!40000 ALTER TABLE `project_managers` DISABLE KEYS */;
INSERT INTO `project_managers` (`id`, `user_id`, `nama`, `no_telp`, `rate_harga`, `spesialisasi`, `deskripsi`, `lokasi`, `pengalaman_tahun`, `file_portofolio`, `file_sertifikat`, `npwp`, `siup`, `pendidikan`, `alasan_hire`, `verification_status`, `rejection_reason`, `foto`, `identity_number`, `npwp_number`, `siup_number`, `entity_type`, `company_name`, `company_license`, `reliability_score`, `created_at`, `updated_at`) VALUES (830,31688,'Aisha Project Management','08712345678',20000000.00,'Agile Construction, Risk Management','Ensuring project delivery on time and within budget.','Jakarta',9,NULL,NULL,NULL,NULL,NULL,NULL,'verified',NULL,NULL,NULL,NULL,NULL,'individual',NULL,NULL,100,'2026-10-02 02:20:38','2026-10-02 02:20:38'),(831,31689,'John (Lead Project Manager)','08771234567',25000000.00,'Financial Oversight & Construction Management','Senior PM with expertise in budget stabilization and technical auditing.','Jakarta Barat',12,NULL,NULL,NULL,NULL,NULL,NULL,'verified',NULL,NULL,NULL,NULL,NULL,'individual',NULL,NULL,100,'2026-10-02 02:20:38','2026-10-02 02:20:38');
/*!40000 ALTER TABLE `project_managers` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_material_folders` WRITE;
/*!40000 ALTER TABLE `project_material_folders` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_material_folders` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_milestones` WRITE;
/*!40000 ALTER TABLE `project_milestones` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_milestones` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_payment_termins` WRITE;
/*!40000 ALTER TABLE `project_payment_termins` DISABLE KEYS */;
INSERT INTO `project_payment_termins` (`id`, `project_id`, `role_type`, `recipient_id`, `label`, `percentage`, `amount`, `retention_amount`, `retention_released_at`, `retention_released_amount`, `net_amount`, `trigger_description`, `status`, `payment_proof_path`, `verification_notes`, `milestone_id`, `change_order_id`, `paid_at`, `notes`, `retention_notes`, `created_at`, `updated_at`, `refunded_amount`) VALUES (900021255,14976,'arsitek',NULL,'DP',50.00,1000000.00,50000.00,NULL,NULL,950000.00,NULL,'locked',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-29 23:37:35','2026-10-02 02:20:39',0.00);
/*!40000 ALTER TABLE `project_payment_termins` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_procurement_requests` WRITE;
/*!40000 ALTER TABLE `project_procurement_requests` DISABLE KEYS */;
INSERT INTO `project_procurement_requests` (`id`, `project_id`, `requirement_id`, `requested_by`, `quantity_needed`, `estimated_unit_cost`, `estimated_cost`, `message`, `offer_to_buy`, `status`, `pm_note`, `created_at`, `updated_at`) VALUES (900025060,14975,900019332,31692,1.00,0.00,NULL,'',0,'pending_pm',NULL,'2026-10-29 23:27:45','2026-10-29 23:27:45');
/*!40000 ALTER TABLE `project_procurement_requests` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_reports` WRITE;
/*!40000 ALTER TABLE `project_reports` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_reports` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_requirement_histories` WRITE;
/*!40000 ALTER TABLE `project_requirement_histories` DISABLE KEYS */;
INSERT INTO `project_requirement_histories` (`id`, `project_requirement_id`, `user_id`, `type`, `quantity`, `notes`, `created_at`, `updated_at`) VALUES (900020069,900019264,31692,'restock',0.00,'Material requirement created','2026-10-29 22:20:42','2026-10-29 22:20:42'),(900020182,900019332,31692,'restock',0.00,'Material requirement created','2026-10-29 23:27:45','2026-10-29 23:27:45');
/*!40000 ALTER TABLE `project_requirement_histories` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_requirements` WRITE;
/*!40000 ALTER TABLE `project_requirements` DISABLE KEYS */;
INSERT INTO `project_requirements` (`id`, `project_id`, `name`, `bom_type`, `quantity_required`, `estimated_unit_cost`, `quantity_on_site`, `quantity_used`, `quantity_procured_externally`, `external_cost`, `unit`, `quality_level`, `image_path`, `notes`, `purpose`, `category`, `created_at`, `updated_at`, `user_id`, `folder_id`) VALUES (900019264,14976,'Parity Fixture','raw',1.00,NULL,0.00,0.00,0.00,0.00,'pcs','standard',NULL,'Pinned by shadow-all gate entries; do not delete.',NULL,'general','2026-10-29 22:20:42','2026-10-02 02:20:39',31692,NULL),(900019332,14975,'Procurement Fixture','raw',1.00,NULL,0.00,0.00,0.00,0.00,'pcs','standard',NULL,NULL,NULL,'general','2026-10-29 23:27:45','2026-10-29 23:27:45',31692,NULL);
/*!40000 ALTER TABLE `project_requirements` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_schedules` WRITE;
/*!40000 ALTER TABLE `project_schedules` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_schedules` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_snag_items` WRITE;
/*!40000 ALTER TABLE `project_snag_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_snag_items` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_sub_professionals` WRITE;
/*!40000 ALTER TABLE `project_sub_professionals` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_sub_professionals` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_terminations` WRITE;
/*!40000 ALTER TABLE `project_terminations` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_terminations` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_timeline_extensions` WRITE;
/*!40000 ALTER TABLE `project_timeline_extensions` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_timeline_extensions` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `project_warranty_claims` WRITE;
/*!40000 ALTER TABLE `project_warranty_claims` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_warranty_claims` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `projects` WRITE;
/*!40000 ALTER TABLE `projects` DISABLE KEYS */;
INSERT INTO `projects` (`id`, `user_id`, `title`, `description`, `budget`, `lokasi`, `jenis_proyek`, `owner_id`, `selected_arsitek_id`, `selected_kontraktor_id`, `selected_notaris_id`, `selected_interior_id`, `pm_id`, `structural_id`, `mep_id`, `structural_approved_at`, `mep_approved_at`, `status`, `published_bidding_roles`, `bidding_choices`, `target_role`, `needed_phases`, `completed_phases`, `wants_project_manager`, `requires_structural`, `requires_mep`, `requires_interior`, `latitude`, `longitude`, `province`, `city`, `kecamatan`, `kelurahan`, `postal_code`, `street_name`, `design_details`, `design_completed_at`, `design_authorized_at`, `materials_authorized_at`, `design_locked_at`, `legal_completed_at`, `pbg_verified_at`, `slf_verified_at`, `legal_locked_at`, `construction_details`, `construction_completed_at`, `construction_authorized_at`, `construction_locked_at`, `construction_brief_status`, `construction_brief_revision_notes`, `interior_details`, `interior_locked_at`, `interior_completed_at`, `planning_status`, `negotiated_fee`, `payment_instructions`, `planning_submitted_at`, `planning_approved_at`, `planning_pm_verified_at`, `design_payment_verified_at`, `construction_payment_verified_at`, `interior_payment_verified_at`, `arsitek_kickoff_at`, `kontraktor_kickoff_at`, `pm_audit_notes`, `pm_audit_attachments`, `architect_notes`, `planning_iteration`, `project_category`, `project_dimensions`, `legal_detail`, `wants_to_discuss_later`, `legal_requirements`, `share_token`, `attachment`, `deadline`, `created_at`, `updated_at`, `design_handover_submitted_at`, `construction_handover_submitted_at`, `interior_handover_submitted_at`, `design_handover_notes`, `construction_handover_notes`, `interior_handover_notes`, `legal_handover_submitted_at`, `legal_handover_notes`, `final_walkthrough_at`, `walkthrough_status`, `completed_at`, `owner_accepted_at`, `owner_acceptance_notes`, `owner_design_approved_at`, `owner_build_approved_at`, `owner_interior_approved_at`, `owner_legal_approved_at`, `warranty_start_at`, `warranty_end_at`, `deleted_at`) VALUES (14970,31682,'Modern Minimalist Villa in Ubud','A successfully completed project showcasing professional excellence and attention to detail.',145319298.00,'Professional Showroom','umum',NULL,6634,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'accepted_arsitek','[]',NULL,'arsitek',NULL,NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(14971,31682,'Sustainable Eco-Resort Concept','A successfully completed project showcasing professional excellence and attention to detail.',43374554.00,'Professional Showroom','umum',NULL,6634,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'completed','[]',NULL,'arsitek',NULL,NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(14972,31682,'Industrial Warehouse Renovation','A successfully completed project showcasing professional excellence and attention to detail.',30089588.00,'Professional Showroom','umum',NULL,NULL,6544,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'completed','[]',NULL,'kontraktor',NULL,NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(14973,31682,'Scandinavian Living Room Makeover','A successfully completed project showcasing professional excellence and attention to detail.',101680345.00,'Professional Showroom','umum',NULL,NULL,NULL,NULL,377,NULL,NULL,NULL,NULL,NULL,'completed','[]',NULL,'arsitek',NULL,NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(14974,31682,'Chic Mid-Century Office Space','A successfully completed project showcasing professional excellence and attention to detail.',64640599.00,'Professional Showroom','umum',NULL,NULL,NULL,NULL,377,NULL,NULL,NULL,NULL,NULL,'completed','[]',NULL,'arsitek',NULL,NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(14975,31692,'Stabilization Test Project (Legal Phase)','A test project specifically for verifying the Legal Ledger and Disbursement flow.',5000000000.00,'Pondok Indah, Jakarta','umum',NULL,NULL,NULL,564,NULL,831,NULL,NULL,NULL,NULL,'legal','[]',NULL,'both',NULL,NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,'2026-10-02 02:20:39','2026-10-02 02:20:39',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(14976,31692,'Demo: Two-storey house - design and build open for bids','Demo project. Two-storey house on a 400 m2 lot in Bekasi: architectural design, structural, and build in two phases. Open for bids from architects and contractors.',850000000.00,'Bekasi, Jawa Barat','rumah',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'open','[\"project_manager\", \"arsitek\", \"kontraktor\"]','{\"arsitek\": \"find\", \"kontraktor\": \"find\", \"project_manager\": \"find\"}','both','[\"design\", \"build\"]',NULL,1,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,'2026-10-02 02:20:39','2026-11-01 23:58:04',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),(14977,31692,'Demo: Notarisation and land documents, BSD pending','Demo project. Notarisation of the sale deed and the land certificate (SHM) transfer for a ready house in Tangerang.',25000000.00,'Tangerang, Banten','tanah',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'open','[\"notaris\"]','{\"notaris\": \"cert_only\"}','arsitek','[\"legal\"]',NULL,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,'draft',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,'2026-10-02 02:20:39','2026-10-30 02:18:04',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `projects` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `provinces`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `provinces` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `provinces` WRITE;
/*!40000 ALTER TABLE `provinces` DISABLE KEYS */;
INSERT INTO `provinces` (`id`, `name`) VALUES (52,'Jawa Barat');
/*!40000 ALTER TABLE `provinces` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `push_subscriptions` WRITE;
/*!40000 ALTER TABLE `push_subscriptions` DISABLE KEYS */;
/*!40000 ALTER TABLE `push_subscriptions` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `regions` WRITE;
/*!40000 ALTER TABLE `regions` DISABLE KEYS */;
INSERT INTO `regions` (`id`, `name`, `id_province`) VALUES (52,'Bekasi',52);
/*!40000 ALTER TABLE `regions` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `role_has_permissions` WRITE;
/*!40000 ALTER TABLE `role_has_permissions` DISABLE KEYS */;
INSERT INTO `role_has_permissions` (`permission_id`, `role_id`) VALUES (1,415),(2,415),(3,415),(4,415);
/*!40000 ALTER TABLE `role_has_permissions` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` (`id`, `name`, `guard_name`, `created_at`, `updated_at`) VALUES (1,'notaris','web','2026-09-29 09:13:51','2026-09-29 09:13:51'),(2,'interior','web','2026-09-29 09:13:52','2026-09-29 09:13:52'),(415,'admin','web','2026-10-02 02:20:37','2026-10-02 02:20:37'),(416,'user','web','2026-10-02 02:20:37','2026-10-02 02:20:37'),(417,'arsitek','web','2026-10-02 02:20:37','2026-10-02 02:20:37'),(418,'kontraktor','web','2026-10-02 02:20:37','2026-10-02 02:20:37'),(419,'project_manager','web','2026-10-02 02:20:37','2026-10-02 02:20:37'),(420,'mep','web','2026-10-02 02:20:37','2026-10-02 02:20:37'),(421,'structural','web','2026-10-02 02:20:37','2026-10-02 02:20:37'),(422,'civil','web','2026-10-02 02:20:39','2026-10-02 02:20:39'),(423,'mechanical','web','2026-10-02 02:20:39','2026-10-02 02:20:39'),(424,'electrical','web','2026-10-02 02:20:39','2026-10-02 02:20:39'),(425,'plumbing','web','2026-10-02 02:20:39','2026-10-02 02:20:39'),(426,'roofing','web','2026-10-02 02:20:39','2026-10-02 02:20:39'),(427,'finishing','web','2026-10-02 02:20:39','2026-10-02 02:20:39');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `rooms` WRITE;
/*!40000 ALTER TABLE `rooms` DISABLE KEYS */;
/*!40000 ALTER TABLE `rooms` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `rooms_pic` WRITE;
/*!40000 ALTER TABLE `rooms_pic` DISABLE KEYS */;
/*!40000 ALTER TABLE `rooms_pic` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `spesialisasi` WRITE;
/*!40000 ALTER TABLE `spesialisasi` DISABLE KEYS */;
/*!40000 ALTER TABLE `spesialisasi` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `sticky_notes` WRITE;
/*!40000 ALTER TABLE `sticky_notes` DISABLE KEYS */;
/*!40000 ALTER TABLE `sticky_notes` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `structural_engineers` WRITE;
/*!40000 ALTER TABLE `structural_engineers` DISABLE KEYS */;
INSERT INTO `structural_engineers` (`id`, `user_id`, `nama`, `no_telp`, `rate_harga`, `reliability_score`, `spesialisasi`, `deskripsi`, `lokasi`, `pengalaman_tahun`, `file_portofolio`, `file_sertifikat`, `npwp`, `siup`, `pendidikan`, `alasan_hire`, `verification_status`, `rejection_reason`, `foto`, `identity_number`, `npwp_number`, `siup_number`, `entity_type`, `company_name`, `company_license`, `created_at`, `updated_at`) VALUES (1079,31690,'Budi Structural & Civil','08512345678',12000000.00,100,'High-Rise, Steel Structures','Expert in structural integrity and earthquake-resistant designs.','Bandung',10,NULL,NULL,NULL,NULL,NULL,NULL,'verified',NULL,NULL,NULL,NULL,NULL,'individual',NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38');
/*!40000 ALTER TABLE `structural_engineers` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `suppliers` WRITE;
/*!40000 ALTER TABLE `suppliers` DISABLE KEYS */;
INSERT INTO `suppliers` (`id`, `user_id`, `store_name`, `address`, `no_telp`, `category`, `bio`, `verification_status`, `rejection_reason`, `foto`, `created_at`, `updated_at`, `detail_location`, `latitude`, `longitude`) VALUES (1093,31687,'Akmal Elite Interior & Furniture','Mall Alam Sutera, GF 12, Tangerang',NULL,'Interior','Premium furniture and decor curated for modern living.','verified',NULL,'https://images.unsplash.com/photo-1524758631624-e2822e304c36?q=80&w=2070&auto=format&fit=crop','2026-10-02 02:20:38','2026-10-02 02:20:38',NULL,NULL,NULL);
/*!40000 ALTER TABLE `suppliers` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `team_members` WRITE;
/*!40000 ALTER TABLE `team_members` DISABLE KEYS */;
/*!40000 ALTER TABLE `team_members` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `user_channels` WRITE;
/*!40000 ALTER TABLE `user_channels` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_channels` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` (`id`, `name`, `email`, `username`, `unique_code`, `email_verified_at`, `password`, `pic`, `firm_name`, `firm_slogan`, `firm_banner_path`, `firm_description`, `firm_is_hiring`, `firm_needed_roles`, `Deskripsi`, `bank_name`, `bank_account_number`, `bank_account_name`, `remember_token`, `created_at`, `updated_at`, `role_type`, `is_suspended`) VALUES (31682,'Giska (Architect)','giska@example.test','giska','F7GRJP',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:37','2026-11-01 22:35:20','arsitek',0),(31683,'Anindia (Contractor)','anindia@example.test','anindia','S7DGWV',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:37','2026-10-02 02:20:37','kontraktor',0),(31684,'Abel (Interior)','abel@example.test','abel','5WM9EW',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38','interior',0),(31685,'Rede (Notary)','rede@example.test','rede','UPVXVF',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38','notaris',0),(31686,'Fariz (Courier)','fariz@example.test','fariz','ETBSKR',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38','user',0),(31687,'Akmal (Supplier)','akmal@example.test','akmal','GNYJRT',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38','user',0),(31688,'Aisha (PM)','aisha@example.test','aisha','PX746D',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38','project_manager',0),(31689,'John (Lead PM)','pm@4c.id','john_pm_lead','HZ2QK2',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38','project_manager',0),(31690,'Budi (Structural)','budi-struc@example.test','budi_struc','TMCFSR',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38','structural',0),(31691,'Andi (MEP)','andi-mep@example.test','andi_mep','J9QDNC',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38','mep',0),(31692,'Malya (Project Owner)','client@example.test','malya','ZZ2A53',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-11-02 03:45:10','user',0),(31693,'Davin','davin@example.test','davin','7GPLM3',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38','user',0),(31694,'System Admin','admin@4c.id','admin','F25V8J',NULL,'$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:38','2026-10-02 02:20:38','admin',0),(31695,'Rudi (Sub-Civil)','sub-civil@example.test','sub_civil','D6NGBZ',NULL,'$2y$12$kWL7RLPtlnvPQqwpJ3jnp.cux9Ckj1yxH3e/3rFUadSlArkfUMP8C',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:39','2026-10-02 02:20:39','civil',0),(31696,'Dimas (Sub-Mechanical)','sub-mechanical@example.test','sub_mechanical','7W7M7S',NULL,'$2y$12$kWL7RLPtlnvPQqwpJ3jnp.cux9Ckj1yxH3e/3rFUadSlArkfUMP8C',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:39','2026-10-02 02:20:39','mechanical',0),(31697,'Wahyu (Sub-Electrical)','sub-electrical@example.test','sub_electrical','75BPXU',NULL,'$2y$12$kWL7RLPtlnvPQqwpJ3jnp.cux9Ckj1yxH3e/3rFUadSlArkfUMP8C',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:39','2026-10-02 02:20:39','electrical',0),(31698,'Hendra (Sub-Plumbing)','sub-plumbing@example.test','sub_plumbing','3APWUE',NULL,'$2y$12$kWL7RLPtlnvPQqwpJ3jnp.cux9Ckj1yxH3e/3rFUadSlArkfUMP8C',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:39','2026-10-02 02:20:39','plumbing',0),(31699,'Teguh (Sub-Roofing)','sub-roofing@example.test','sub_roofing','RHLA7A',NULL,'$2y$12$kWL7RLPtlnvPQqwpJ3jnp.cux9Ckj1yxH3e/3rFUadSlArkfUMP8C',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:39','2026-10-02 02:20:39','roofing',0),(31700,'Agus (Sub-Finishing)','sub-finishing@example.test','sub_finishing','6PGUQX',NULL,'$2y$12$kWL7RLPtlnvPQqwpJ3jnp.cux9Ckj1yxH3e/3rFUadSlArkfUMP8C',NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 02:20:39','2026-10-02 02:20:39','finishing',0);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

