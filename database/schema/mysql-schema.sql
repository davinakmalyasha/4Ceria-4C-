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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `pendidikan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alasan_hire` text COLLATE utf8mb4_unicode_ci,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reliability_score` int NOT NULL DEFAULT '100',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `arsiteks_user_id_foreign` (`user_id`),
  CONSTRAINT `arsiteks_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_arsitek`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_arsitek` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `arsitek_id` bigint unsigned DEFAULT NULL,
  `price` decimal(24,2) NOT NULL DEFAULT '0.00',
  `fee_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed',
  `unit_price` bigint DEFAULT NULL,
  `quantity` decimal(15,2) DEFAULT NULL,
  `calculated_total` bigint DEFAULT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','shortlisted','accepted','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
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
  PRIMARY KEY (`id`),
  KEY `bids_arsitek_project_id_foreign` (`project_id`),
  KEY `bids_arsitek_arsitek_id_foreign` (`arsitek_id`),
  CONSTRAINT `bids_arsitek_arsitek_id_foreign` FOREIGN KEY (`arsitek_id`) REFERENCES `arsiteks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_arsitek_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_interior`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_interior` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `interior_id` bigint unsigned NOT NULL,
  `price` decimal(15,2) NOT NULL,
  `fee_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed',
  `unit_price` bigint DEFAULT NULL,
  `quantity` decimal(15,2) DEFAULT NULL,
  `calculated_total` bigint DEFAULT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci,
  `scopes` json DEFAULT NULL,
  `deliverables` json DEFAULT NULL,
  `style` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','shortlisted','accepted','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `estimated_duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration_unit` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `paid_at` timestamp NULL DEFAULT NULL,
  `attachment_1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_2` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_3` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bids_interior_interior_id_foreign` (`interior_id`),
  KEY `bids_interior_project_id_status_index` (`project_id`,`status`),
  CONSTRAINT `bids_interior_interior_id_foreign` FOREIGN KEY (`interior_id`) REFERENCES `interior_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_interior_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_kontraktor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_kontraktor` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `kontraktor_id` bigint unsigned DEFAULT NULL,
  `price` decimal(24,2) NOT NULL DEFAULT '0.00',
  `fee_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed',
  `unit_price` bigint DEFAULT NULL,
  `quantity` decimal(15,2) DEFAULT NULL,
  `calculated_total` bigint DEFAULT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','shortlisted','accepted','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
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
  PRIMARY KEY (`id`),
  KEY `bids_kontraktor_project_id_foreign` (`project_id`),
  KEY `bids_kontraktor_kontraktor_id_foreign` (`kontraktor_id`),
  CONSTRAINT `bids_kontraktor_kontraktor_id_foreign` FOREIGN KEY (`kontraktor_id`) REFERENCES `kontraktors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_kontraktor_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_mep`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_mep` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `mep_id` bigint unsigned NOT NULL,
  `price` bigint NOT NULL,
  `fee_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed',
  `unit_price` bigint DEFAULT NULL,
  `quantity` decimal(15,2) DEFAULT NULL,
  `calculated_total` bigint DEFAULT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
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
  PRIMARY KEY (`id`),
  KEY `bids_mep_project_id_foreign` (`project_id`),
  KEY `bids_mep_mep_id_foreign` (`mep_id`),
  CONSTRAINT `bids_mep_mep_id_foreign` FOREIGN KEY (`mep_id`) REFERENCES `mep_engineers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_mep_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_notaris`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_notaris` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `notaris_id` bigint unsigned NOT NULL,
  `price` decimal(24,2) NOT NULL DEFAULT '0.00',
  `fee_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed',
  `unit_price` bigint DEFAULT NULL,
  `quantity` decimal(15,2) DEFAULT NULL,
  `calculated_total` bigint DEFAULT NULL,
  `tax_estimate` decimal(24,2) DEFAULT NULL,
  `fee_percentage` decimal(5,2) DEFAULT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','shortlisted','accepted','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
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
  PRIMARY KEY (`id`),
  KEY `bids_notaris_notaris_id_foreign` (`notaris_id`),
  KEY `bids_notaris_project_id_status_index` (`project_id`,`status`),
  CONSTRAINT `bids_notaris_notaris_id_foreign` FOREIGN KEY (`notaris_id`) REFERENCES `notaris_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_notaris_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_project_manager`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_project_manager` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `pm_id` bigint unsigned NOT NULL,
  `price` decimal(15,2) NOT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `estimated_duration` int DEFAULT NULL,
  `duration_unit` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'weeks',
  `fee_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_price` bigint DEFAULT NULL,
  `quantity` decimal(15,2) DEFAULT NULL,
  `calculated_total` bigint DEFAULT NULL,
  `scopes` json DEFAULT NULL,
  `deliverables` json DEFAULT NULL,
  `payment_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bids_project_manager_project_id_foreign` (`project_id`),
  KEY `bids_project_manager_pm_id_foreign` (`pm_id`),
  CONSTRAINT `bids_project_manager_pm_id_foreign` FOREIGN KEY (`pm_id`) REFERENCES `project_managers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_project_manager_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bids_structural`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bids_structural` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `structural_id` bigint unsigned NOT NULL,
  `price` bigint NOT NULL,
  `fee_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed',
  `unit_price` bigint DEFAULT NULL,
  `quantity` decimal(15,2) DEFAULT NULL,
  `calculated_total` bigint DEFAULT NULL,
  `proposal` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
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
  PRIMARY KEY (`id`),
  KEY `bids_structural_project_id_foreign` (`project_id`),
  KEY `bids_structural_structural_id_foreign` (`structural_id`),
  CONSTRAINT `bids_structural_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bids_structural_structural_id_foreign` FOREIGN KEY (`structural_id`) REFERENCES `structural_engineers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `chat_messages_conversation_id_foreign` (`conversation_id`),
  KEY `chat_messages_sender_id_foreign` (`sender_id`),
  CONSTRAINT `chat_messages_conversation_id_foreign` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_messages_sender_id_foreign` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  KEY `conversations_user_two_id_foreign` (`user_two_id`),
  CONSTRAINT `conversations_user_one_id_foreign` FOREIGN KEY (`user_one_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conversations_user_two_id_foreign` FOREIGN KEY (`user_two_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  PRIMARY KEY (`id`),
  KEY `courier_profiles_user_id_foreign` (`user_id`),
  CONSTRAINT `courier_profiles_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `agreed_fee` decimal(15,2) DEFAULT NULL,
  `estimated_weight` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `delivery_jobs_quote_id_foreign` (`quote_id`),
  KEY `delivery_jobs_order_id_foreign` (`order_id`),
  KEY `delivery_jobs_logistics_id_foreign` (`logistics_id`),
  CONSTRAINT `delivery_jobs_logistics_id_foreign` FOREIGN KEY (`logistics_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `delivery_jobs_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `material_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `delivery_jobs_quote_id_foreign` FOREIGN KEY (`quote_id`) REFERENCES `material_quotes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
DROP TABLE IF EXISTS `house`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `house` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(15,2) DEFAULT NULL,
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
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `house_id_user_foreign` (`id_user`),
  CONSTRAINT `house_id_user_foreign` FOREIGN KEY (`id_user`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  KEY `house_pic_id_house_foreign` (`id_house`),
  CONSTRAINT `house_pic_id_house_foreign` FOREIGN KEY (`id_house`) REFERENCES `house` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `reliability_score` int NOT NULL DEFAULT '100',
  `file_portofolio` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_sertifikat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `rate_harga` decimal(24,2) NOT NULL DEFAULT '0.00',
  `pendidikan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alasan_hire` text COLLATE utf8mb4_unicode_ci,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reliability_score` int NOT NULL DEFAULT '100',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `kontraktors_user_id_foreign` (`user_id`),
  CONSTRAINT `kontraktors_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `material_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_order_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `material_id` bigint unsigned NOT NULL,
  `quantity` int NOT NULL,
  `price_at_order` decimal(15,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `material_order_items_order_id_foreign` (`order_id`),
  KEY `material_order_items_material_id_foreign` (`material_id`),
  CONSTRAINT `material_order_items_material_id_foreign` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`) ON DELETE CASCADE,
  CONSTRAINT `material_order_items_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `material_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `material_order_reviews_order_id_unique` (`order_id`),
  KEY `material_order_reviews_user_id_foreign` (`user_id`),
  KEY `material_order_reviews_supplier_id_foreign` (`supplier_id`),
  CONSTRAINT `material_order_reviews_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `material_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `material_order_reviews_supplier_id_foreign` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `material_order_reviews_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `material_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `supplier_id` bigint unsigned NOT NULL,
  `project_id` bigint unsigned DEFAULT NULL,
  `status` enum('pending','awaiting_payment','verifying','paid','shipping','delivered','completed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `total_price` decimal(15,2) NOT NULL,
  `shipping_cost` decimal(15,2) NOT NULL DEFAULT '0.00',
  `whatsapp_order_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `paid_at` timestamp NULL DEFAULT NULL,
  `shipped_at` timestamp NULL DEFAULT NULL,
  `delivered_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `material_orders_whatsapp_order_id_unique` (`whatsapp_order_id`),
  KEY `material_orders_user_id_foreign` (`user_id`),
  KEY `material_orders_supplier_id_foreign` (`supplier_id`),
  KEY `material_orders_project_id_foreign` (`project_id`),
  CONSTRAINT `material_orders_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `material_orders_supplier_id_foreign` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `material_orders_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `total_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `material_quotes_user_id_foreign` (`user_id`),
  KEY `material_quotes_supplier_id_foreign` (`supplier_id`),
  KEY `material_quotes_project_id_foreign` (`project_id`),
  CONSTRAINT `material_quotes_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `material_quotes_supplier_id_foreign` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `material_quotes_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `materials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `materials` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `supplier_id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `price` decimal(15,2) NOT NULL,
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
  CONSTRAINT `materials_supplier_id_foreign` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `spesialisasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deskripsi` text COLLATE utf8mb4_unicode_ci,
  `lokasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pengalaman_tahun` int NOT NULL DEFAULT '0',
  `file_portofolio` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_sertifikat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pendidikan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `mep_engineers_user_id_foreign` (`user_id`),
  CONSTRAINT `mep_engineers_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `reliability_score` int NOT NULL DEFAULT '100',
  `nomor_sk` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'License/SK number',
  `wilayah_kerja` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Work jurisdiction area',
  `spesialisasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'AJB, PBG, SHM, etc',
  `deskripsi` text COLLATE utf8mb4_unicode_ci,
  `lokasi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pengalaman_tahun` int NOT NULL DEFAULT '0',
  `rate_harga` decimal(24,2) NOT NULL DEFAULT '0.00',
  `file_sertifikat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notaris_profiles_user_id_unique` (`user_id`),
  CONSTRAINT `notaris_profiles_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `price` decimal(15,2) NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `notaris_services_notaris_id_foreign` (`notaris_id`),
  CONSTRAINT `notaris_services_notaris_id_foreign` FOREIGN KEY (`notaris_id`) REFERENCES `notaris_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  KEY `notifications_user_id_foreign` (`user_id`),
  CONSTRAINT `notifications_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
DROP TABLE IF EXISTS `pengajuan_spesialisasi`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pengajuan_spesialisasi` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `kontraktor_id` bigint unsigned NOT NULL,
  `spesialisasi_id` bigint unsigned NOT NULL,
  `file_sertifikat` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `catatan` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `pengajuan_spesialisasi_kontraktor_id_foreign` (`kontraktor_id`),
  KEY `pengajuan_spesialisasi_spesialisasi_id_foreign` (`spesialisasi_id`),
  CONSTRAINT `pengajuan_spesialisasi_kontraktor_id_foreign` FOREIGN KEY (`kontraktor_id`) REFERENCES `kontraktors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pengajuan_spesialisasi_spesialisasi_id_foreign` FOREIGN KEY (`spesialisasi_id`) REFERENCES `spesialisasi` (`id`) ON DELETE CASCADE
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  KEY `project_activity_logs_project_id_foreign` (`project_id`),
  KEY `project_activity_logs_user_id_foreign` (`user_id`),
  CONSTRAINT `project_activity_logs_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_activity_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_addendums`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_addendums` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `role_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `amount` decimal(24,2) NOT NULL,
  `recommended_bid_id` bigint unsigned DEFAULT NULL,
  `recommended_bid_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending_approval','approved_unpaid','rejected','verifying','paid') COLLATE utf8mb4_unicode_ci DEFAULT 'pending_approval',
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `procurement_request_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_addendums_project_id_foreign` (`project_id`),
  KEY `project_addendums_user_id_foreign` (`user_id`),
  KEY `project_addendums_procurement_request_id_foreign` (`procurement_request_id`),
  CONSTRAINT `project_addendums_procurement_request_id_foreign` FOREIGN KEY (`procurement_request_id`) REFERENCES `project_procurement_requests` (`id`) ON DELETE SET NULL,
  CONSTRAINT `project_addendums_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_addendums_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_budget_sandbox`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_budget_sandbox` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estimated_amount` decimal(15,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_budget_sandbox_project_id_foreign` (`project_id`),
  CONSTRAINT `project_budget_sandbox_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_budget_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_budget_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `transaction_type` enum('deposit','adjustment_down','payment','refund') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(24,2) NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `reference_model` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_id` bigint unsigned DEFAULT NULL,
  `transaction_date` timestamp NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_budget_transactions_project_id_foreign` (`project_id`),
  CONSTRAINT `project_budget_transactions_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_change_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_change_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `requested_by` bigint unsigned NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `cost_impact` decimal(15,2) NOT NULL DEFAULT '0.00',
  `time_impact_days` int NOT NULL DEFAULT '0',
  `status` enum('proposed','pm_reviewed','owner_approved','rejected','implemented') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'proposed',
  `pm_notes` text COLLATE utf8mb4_unicode_ci,
  `owner_notes` text COLLATE utf8mb4_unicode_ci,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_change_orders_requested_by_foreign` (`requested_by`),
  KEY `project_change_orders_project_id_status_index` (`project_id`,`status`),
  CONSTRAINT `project_change_orders_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_change_orders_requested_by_foreign` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_comments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_comments_project_id_foreign` (`project_id`),
  KEY `project_comments_user_id_foreign` (`user_id`),
  CONSTRAINT `project_comments_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_comments_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_documents` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `uploader_id` bigint unsigned NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'structural|mep|architect - who this doc is for',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `version_label` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_documents_project_id_foreign` (`project_id`),
  KEY `project_documents_uploader_id_foreign` (`uploader_id`),
  CONSTRAINT `project_documents_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_documents_uploader_id_foreign` FOREIGN KEY (`uploader_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_external_vendors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_external_vendors` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `phase_role` enum('arsitek','kontraktor','notaris','interior','project_manager') COLLATE utf8mb4_unicode_ci NOT NULL,
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_person` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_number` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `agreed_fee` decimal(15,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_external_vendors_project_id_foreign` (`project_id`),
  CONSTRAINT `project_external_vendors_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `pendidikan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reliability_score` int NOT NULL DEFAULT '100',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_managers_user_id_foreign` (`user_id`),
  CONSTRAINT `project_managers_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'milestone',
  `content` json DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `start_date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `is_completed` tinyint(1) NOT NULL DEFAULT '0',
  `approval_status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `revision_notes` text COLLATE utf8mb4_unicode_ci,
  `phase_context` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pm_verified_at` timestamp NULL DEFAULT NULL,
  `progress_attachment` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_milestones_project_id_foreign` (`project_id`),
  CONSTRAINT `project_milestones_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `amount` bigint NOT NULL DEFAULT '0',
  `retention_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `net_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `trigger_description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'locked',
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `milestone_id` bigint unsigned DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `retention_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_payment_termins_project_id_index` (`project_id`),
  KEY `project_payment_termins_milestone_id_foreign` (`milestone_id`),
  KEY `project_payment_termins_role_type_index` (`role_type`),
  KEY `project_payment_termins_recipient_id_foreign` (`recipient_id`),
  CONSTRAINT `project_payment_termins_milestone_id_foreign` FOREIGN KEY (`milestone_id`) REFERENCES `project_milestones` (`id`) ON DELETE SET NULL,
  CONSTRAINT `project_payment_termins_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_payment_termins_recipient_id_foreign` FOREIGN KEY (`recipient_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `project_requirements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_requirements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity_required` decimal(15,2) NOT NULL,
  `quantity_on_site` decimal(15,2) NOT NULL DEFAULT '0.00',
  `quantity_used` decimal(15,2) NOT NULL DEFAULT '0.00',
  `quantity_procured_externally` decimal(15,2) NOT NULL DEFAULT '0.00',
  `external_cost` decimal(15,2) NOT NULL DEFAULT '0.00',
  `unit` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quality_level` enum('standard','premium','luxury') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'standard',
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `category` enum('structural','architecture','mep','interior','general') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_requirements_project_id_foreign` (`project_id`),
  CONSTRAINT `project_requirements_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  CONSTRAINT `project_snag_items_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_snag_items_reported_by_foreign` FOREIGN KEY (`reported_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `cost_impact` decimal(15,2) NOT NULL DEFAULT '0.00',
  `resolved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_warranty_claims_project_id_foreign` (`project_id`),
  KEY `project_warranty_claims_reporter_id_foreign` (`reporter_id`),
  CONSTRAINT `project_warranty_claims_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_warranty_claims_reporter_id_foreign` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `status` enum('open','accepted_arsitek','accepted_kontraktor','in_progress','legal','procurement','completed_build','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `published_bidding_roles` json DEFAULT NULL,
  `bidding_choices` json DEFAULT NULL,
  `target_role` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'arsitek',
  `needed_phases` json DEFAULT NULL,
  `completed_phases` json DEFAULT NULL,
  `wants_project_manager` tinyint(1) NOT NULL DEFAULT '0',
  `requires_structural` tinyint(1) NOT NULL DEFAULT '0',
  `requires_mep` tinyint(1) NOT NULL DEFAULT '0',
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
  `design_locked_at` timestamp NULL DEFAULT NULL,
  `legal_completed_at` timestamp NULL DEFAULT NULL,
  `pbg_verified_at` timestamp NULL DEFAULT NULL,
  `slf_verified_at` timestamp NULL DEFAULT NULL,
  `legal_locked_at` timestamp NULL DEFAULT NULL,
  `construction_details` json DEFAULT NULL,
  `construction_completed_at` timestamp NULL DEFAULT NULL,
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
  `design_payment_verified_at` timestamp NULL DEFAULT NULL,
  `construction_payment_verified_at` timestamp NULL DEFAULT NULL,
  `interior_payment_verified_at` timestamp NULL DEFAULT NULL,
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
  `owner_accepted_at` timestamp NULL DEFAULT NULL,
  `owner_acceptance_notes` text COLLATE utf8mb4_unicode_ci,
  `owner_design_approved_at` timestamp NULL DEFAULT NULL,
  `owner_build_approved_at` timestamp NULL DEFAULT NULL,
  `owner_interior_approved_at` timestamp NULL DEFAULT NULL,
  `owner_legal_approved_at` timestamp NULL DEFAULT NULL,
  `warranty_start_at` timestamp NULL DEFAULT NULL,
  `warranty_end_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `projects_share_token_unique` (`share_token`),
  KEY `projects_user_id_foreign` (`user_id`),
  CONSTRAINT `projects_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `provinces`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `provinces` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `riwayat_projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `riwayat_projects` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `arsitek_id` bigint unsigned NOT NULL,
  `kontraktor_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `selesai_pada` timestamp NULL DEFAULT NULL,
  `keterangan` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `riwayat_projects_project_id_foreign` (`project_id`),
  KEY `riwayat_projects_arsitek_id_foreign` (`arsitek_id`),
  KEY `riwayat_projects_kontraktor_id_foreign` (`kontraktor_id`),
  KEY `riwayat_projects_user_id_foreign` (`user_id`),
  CONSTRAINT `riwayat_projects_arsitek_id_foreign` FOREIGN KEY (`arsitek_id`) REFERENCES `arsiteks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `riwayat_projects_kontraktor_id_foreign` FOREIGN KEY (`kontraktor_id`) REFERENCES `kontraktors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `riwayat_projects_project_id_foreign` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `riwayat_projects_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  KEY `rooms_id_house_foreign` (`id_house`),
  CONSTRAINT `rooms_id_house_foreign` FOREIGN KEY (`id_house`) REFERENCES `house` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  KEY `rooms_pic_id_room_foreign` (`id_room`),
  CONSTRAINT `rooms_pic_id_room_foreign` FOREIGN KEY (`id_room`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
DROP TABLE IF EXISTS `structural_engineers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `structural_engineers` (
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
  `pendidikan` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `foto` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `structural_engineers_user_id_foreign` (`user_id`),
  CONSTRAINT `structural_engineers_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  PRIMARY KEY (`id`),
  KEY `suppliers_user_id_foreign` (`user_id`),
  CONSTRAINT `suppliers_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
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
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pic` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Deskripsi` text COLLATE utf8mb4_unicode_ci,
  `bank_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_account_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_account_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `role_type` enum('user','arsitek','kontraktor','admin','supplier','logistics','notaris','interior','project_manager','structural','mep') COLLATE utf8mb4_unicode_ci DEFAULT 'user',
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  UNIQUE KEY `users_username_unique` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (1,'0001_01_01_000000_create_users_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (2,'0001_01_01_000001_create_cache_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (3,'0001_01_01_000002_create_jobs_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (4,'2024_11_05_141213_create_permission_tables',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (5,'2025_03_15_101457_create_arsiteks_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (6,'2025_03_19_142734_create_kontraktors_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (7,'2025_03_19_155941_create_projects_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (8,'2025_03_19_155942_create_bids_arsiteks_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (9,'2025_03_19_155942_create_bids_kontraktors_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (10,'2026_03_23_071108_create_personal_access_tokens_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (11,'2026_03_24_014924_create_project_images_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (12,'2026_04_01_030443_create_project_milestones_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (13,'2026_04_01_030444_create_project_comments_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (14,'2026_04_01_030444_create_project_documents_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (15,'2026_04_01_033621_alter_status_enum_in_projects_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (16,'2026_04_01_111530_add_rich_profile_fields_to_professionals',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (17,'2026_04_01_124510_add_target_role_to_projects_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (18,'2026_04_01_134942_fix_bids_foreign_keys',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (19,'2026_04_01_141958_create_notifications_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (20,'2026_04_01_142247_add_verification_fields_to_professionals_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (21,'2026_04_02_011230_fix_projects_selected_foreign_keys',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (22,'2026_04_02_034518_add_duration_and_attachments_to_bids',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (23,'2026_04_02_043406_create_ratings_tables',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (24,'2026_04_02_095940_add_type_to_rooms_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (25,'2026_04_02_104500_add_duration_and_attachments_to_bids',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (26,'2026_04_02_114737_add_foto_and_portfolio_to_kontraktors',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (27,'2026_04_02_170557_add_location_fields_to_projects_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (28,'2026_04_02_203333_add_image_to_chat_messages_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (29,'2026_04_03_022600_create_conversations_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (30,'2026_04_03_022601_create_chat_messages_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (31,'2026_04_03_051744_add_parent_id_to_project_comments',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (32,'2026_04_04_042525_update_user_roles_add_supplier_and_logistik',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (33,'2026_04_04_043234_create_suppliers_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (34,'2026_04_04_043235_create_materials_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (35,'2026_04_04_043236_create_material_orders_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (36,'2026_04_04_043237_create_material_order_items_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (37,'2026_04_04_072755_create_material_quotes_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (38,'2026_04_04_074940_create_material_images_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (39,'2026_04_04_114530_add_delivery_method_to_material_orders',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (40,'2026_04_04_155437_update_material_quotes_for_logistics',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (41,'2026_04_04_155515_create_delivery_jobs_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (42,'2026_04_04_212720_add_stock_tracking_to_material_orders',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (43,'2026_04_04_213037_create_material_order_reviews_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (44,'2026_04_05_032500_update_material_orders_status_enum',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (45,'2026_04_05_032757_add_delivery_documentation_to_material_orders',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (46,'2026_04_05_034500_add_coordinates_to_quotes_and_orders',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (47,'2026_04_05_035801_add_address_detail_to_quotes_and_orders',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (48,'2026_04_05_040400_sync_logistics_schema',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (49,'2026_04_05_045000_add_total_weight_to_material_quotes_and_orders',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (50,'2026_04_05_050000_update_material_order_reviews_for_multiple_images',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (51,'2026_04_05_053040_create_delivery_jobs_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (52,'2026_04_05_054217_create_courier_profiles_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (53,'2026_04_05_054534_update_users_role_type_for_logistics',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (54,'2026_04_05_055729_add_location_coords_to_suppliers_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (55,'2026_04_05_061900_add_detail_location_to_suppliers_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (56,'2026_04_05_065833_add_photos_to_delivery_jobs_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (57,'2026_04_05_102118_add_delivery_fields_to_material_order_reviews',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (58,'2026_04_05_104637_split_review_images_for_material_order_reviews',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (59,'2026_04_05_143950_add_dates_to_project_milestones_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (60,'2026_04_05_153802_create_project_requirements_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (61,'2026_04_05_153811_add_requirement_id_to_material_order_items_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (62,'2026_04_06_100117_add_progress_attachment_to_project_milestones',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (63,'2026_04_11_100001_add_notaris_and_interior_roles',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (64,'2026_04_11_100002_create_notaris_profiles_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (65,'2026_04_11_100003_create_interior_profiles_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (66,'2026_04_11_100004_create_bids_notaris_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (67,'2026_04_11_100005_create_bids_interior_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (68,'2026_04_11_100006_add_new_phase_columns_to_projects',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (69,'2026_04_12_082638_create_interior_and_notaris_ratings_tables',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (70,'2026_04_12_085505_add_missing_columns_to_kontraktors_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (71,'2026_04_12_121542_create_notaris_services_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (72,'2026_04_12_121543_create_notaris_consultations_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (73,'2026_04_12_121543_update_project_tables_for_notary_features',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (74,'2026_04_12_152859_add_tax_estimate_to_bids_notaris',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (75,'2026_04_12_213917_add_design_details_to_projects',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (76,'2026_04_13_033718_add_completed_phases_to_projects_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (77,'2026_04_13_070000_add_image_to_project_milestones',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (78,'2026_04_13_074959_add_type_to_project_milestones_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (79,'2026_04_13_080631_add_content_to_project_milestones_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (80,'2026_04_13_084048_add_approval_fields_to_project_milestones',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (81,'2026_04_13_084054_add_quality_level_to_project_requirements',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (82,'2026_04_13_194235_add_handover_features_to_projects_and_requirements',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (83,'2026_04_13_211447_add_procurement_status_to_projects_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (84,'2026_04_13_220118_add_construction_fields_to_projects',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (85,'2026_04_13_220118_create_project_daily_logs_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (86,'2026_04_13_220119_create_project_payment_termins_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (87,'2026_04_13_230718_add_phase_lock_timestamps_to_projects_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (88,'2026_04_14_000001_add_share_token_to_projects_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (89,'2026_04_14_051700_add_contractor_bid_fields_to_bids_kontraktor',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (90,'2026_04_14_085653_add_payment_tracking_to_bids_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (91,'2026_04_14_085654_create_project_addendums_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (92,'2026_04_14_085655_create_project_budget_transactions_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (93,'2026_04_14_085656_create_project_budget_sandbox_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (94,'2026_04_14_110000_add_interior_and_phase_context_fields',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (95,'2026_04_14_114758_add_external_procurement_to_project_requirements',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (96,'2026_04_14_190227_add_enterprise_roles_to_users_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (97,'2026_04_14_190246_add_enterprise_fields_to_projects_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (98,'2026_04_14_190305_create_enterprise_profiles_tables',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (99,'2026_04_15_000001_create_bids_project_manager_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (100,'2026_04_15_101618_add_structured_data_to_pm_bids',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (101,'2026_04_15_103242_add_pm_id_to_project_milestones',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (102,'2026_04_15_132837_add_selected_services_to_bids_notaris_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (103,'2026_04_15_203910_add_structured_columns_to_professional_bids',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (104,'2026_04_16_005749_add_role_and_verification_to_payments',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (105,'2026_04_16_013403_update_planning_status_enum_in_projects',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (106,'2026_04_16_014802_add_pm_audit_fields_to_projects',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (107,'2026_04_16_015632_add_architect_notes_to_projects',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (108,'2026_04_16_044500_add_requires_mep_to_projects_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (109,'2026_04_16_052000_update_project_planning_workflow',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (110,'2026_04_16_061939_add_planning_iteration_to_projects_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (111,'2026_04_16_121246_add_project_category_and_dimensions_to_projects_table',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (112,'2026_04_16_135103_add_legal_requirements_to_projects_and_fee_percentage_to_bids',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (113,'2026_04_16_231621_increase_amount_precision_in_financial_tables',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (114,'2026_04_17_000001_create_extended_ratings_tables',1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (115,'2026_04_17_999999_restore_legacy_tables',2);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (116,'2026_04_17_999998_restore_remaining_legacy_tables',3);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (117,'2026_04_19_232807_add_fee_scopes_deliverables_to_bids_project_manager_table',4);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (118,'2026_04_19_234907_create_project_external_vendors_table',5);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (119,'2026_04_19_234921_add_published_bidding_roles_to_projects_table',5);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (120,'2026_04_20_001621_add_category_and_status_to_project_documents_table',6);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (121,'2026_04_20_030903_add_flexible_fee_columns_to_bids_tables',7);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (122,'2026_04_20_130408_add_role_info_to_project_payment_termins_table',8);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (123,'2026_04_21_001325_create_engineering_bids_tables',9);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (124,'2026_04_21_010703_add_legal_timestamps_to_projects_table',10);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (125,'2026_04_21_120000_add_engineering_integration_fields',11);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (126,'2026_04_21_071834_add_recommended_bid_to_project_addendums_table',12);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (127,'2026_04_21_112954_sync_project_requirements_schema',13);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (128,'2026_04_21_174823_add_legal_gates_to_projects_table',14);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (129,'2026_04_21_181114_add_construction_brief_status_to_projects_table',15);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (130,'2026_04_21_184413_add_missing_columns_to_financial_tables',16);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (131,'2026_04_22_045108_create_project_procurement_requests_table',17);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (132,'2026_04_22_045109_add_procurement_request_id_to_project_addendums_table',17);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (133,'2026_04_22_084929_add_handover_verification_to_projects',18);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (134,'2026_04_23_052943_add_structured_fields_to_professional_bids_table',19);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (135,'2026_04_23_154223_add_legal_handover_to_projects',20);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (136,'2026_04_23_174643_create_project_snag_items_table',21);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (137,'2026_04_23_174651_create_project_change_orders_table',21);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (138,'2026_04_23_174652_add_handover_and_owner_fields_to_projects_table',21);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (139,'2026_04_24_012525_add_retention_to_payment_termins',22);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (140,'2026_04_24_012530_create_project_warranty_claims',22);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (141,'2026_04_24_012534_create_project_timeline_extensions',22);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (142,'2026_04_24_023052_add_category_to_project_requirements',23);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (143,'2026_04_24_023057_add_version_label_to_project_documents',23);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (144,'2026_04_24_032624_add_resolution_photos_to_project_snag_items',24);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (145,'2026_04_24_064934_create_p_m_ratings_table',25);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (146,'2026_04_24_065034_add_reliability_score_to_professional_profiles',25);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (147,'2026_04_25_235819_add_owner_legal_approved_at_to_projects',26);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (148,'2026_04_26_005435_add_payment_verification_dates_to_projects',27);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (149,'2026_04_26_074248_add_legal_details_to_projects_table',28);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (150,'2026_04_26_081626_add_project_manager_to_external_vendors_phase_role',29);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (151,'2026_04_26_082840_add_bidding_choices_to_projects_table',30);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (152,'2026_04_26_231814_create_project_reports_table',31);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (153,'2026_04_27_014141_create_project_schedules_table',32);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (154,'2026_04_27_015456_add_phase_slug_to_project_reports_table',33);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (155,'2026_04_29_071251_add_bank_details_to_users_table',34);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (156,'2026_04_29_071305_add_proof_of_transfer_to_payment_tables',34);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (157,'2026_04_29_150000_add_shortlisted_status_to_bids_tables',35);
