# 4C Database Schema Reference 🗃️

This document maps out every localized table, its total row count, and the exact physical SQL column layouts operating inside your `4c-build` MySQL database.

## System, Auth & Administration
### 1. `users` *(34 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26) (bigint unsigned)
- `name` (varchar)
- `email` (varchar)
- `username` (varchar)
- `email_verified_at` (timestamp)
- `password` (varchar)
- `remember_token` (varchar)
- `role_type` (varchar)
- `pic` (varchar)
- `Deskripsi` (varchar)
- `created_at` / `updated_at`

### 2. [admin](file:///c:/laragon/www/4CeriaJmbt-riza/app/Models/User.php#70-74) *(2 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26) (int unsigned)
- `user_id` (bigint unsigned)
- `nama` (varchar)
- `no_telp` (varchar)
- `foto` (varchar)
- `created_at` / `updated_at`

### 3. `personal_access_tokens` *(2 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `tokenable_type`, `tokenable_id`, `name`, `token`, `abilities`, `last_used_at`, `expires_at`, timestamps

### 4. `password_reset_tokens` *(0 rows)*
- `email`, `token`, `created_at`

### 5. `sessions` *(2 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `user_id`, `ip_address`, `user_agent`, `payload`, `last_activity`

### 6. `cache` *(0 rows)*
- `key`, `value`, `expiration`

---

## Role-Based Access Control (Spatie)
### 7. `roles` *(4 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `name`, `guard_name`, timestamps
### 8. `permissions` *(17 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `name`, `display_name`, `guard_name`, timestamps
### 9. `model_has_roles` *(25 rows)*
- `role_id`, `model_type`, `model_id`
### 10. `model_has_permissions` *(14 rows)*
- `permission_id`, `model_type`, `model_id`
### 11. `role_has_permissions` *(3 rows)*
- `permission_id`, `role_id`

---

## Real Estate Ecosystem (Houses & Rooms)
### 12. [house](file:///c:/laragon/www/4CeriaJmbt-riza/app/Models/User.php#55-58) *(8 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26) (int)
- `name` (varchar)
- `price` (bigint)
- `house_desc` (text)
- `width` (int)
- `length` (int)
- `br` (int) - Bedrooms
- [ba](file:///c:/laragon/www/4CeriaJmbt-riza/resources/js/components/Navbar.tsx#5-149) (int) - Bathrooms
- `floors` (int)
- `coordinate` (varchar)
- `street_name` (varchar)
- `kelurahan` / `kecamatan` / `kab_kota` / `province` / `postal_code`
- `views` (int)
- `id_user` (bigint unsigned)
- timestamps

### 13. `house_pic` *(17 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `file_name`, `dir`, `size`, `id_house`, timestamps
### 14. `house_certif` *(0 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `house_cert_dir`, `shm_dir`, `id_house`

### 15. `rooms` *(3 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `name`, `width`, `length`, `desc`, `id_house`, timestamps
### 16. `rooms_pic` *(4 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `file_name`, `dir`, `size`, `id_room`, timestamps

### 17. `provinces` *(4 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `name`
### 18. `regions` *(10 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `id_province`, `name`

---

## Professionals & Tendering workflows (Bidding Engine)
### 19. [projects](file:///c:/laragon/www/4CeriaJmbt-riza/app/Models/Kontraktor.php#41-45) *(15 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26) (bigint unsigned)
- `user_id` (bigint unsigned)
- `title` (varchar)
- `description` (text)
- `budget` (bigint)
- `lokasi` (varchar)
- `status` (enum: open, accepted_arsitek, accepted_kontraktor, completed)
- `selected_arsitek_id` / `selected_kontraktor_id`
- `status_kontraktor` (enum: pending, posted, skip)
- `jenis_proyek` (enum: umum, fondasi, struktur, dinding, atap, lantai, ventilasi, listrik)
- `deadline` (date)
- `attachment` (varchar)
- timestamps

### 20. `arsiteks` *(2 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `nama`, `user_id`, `no_telp`, `foto`, `file_portofolio`, `file_sertifikat`, `rate_harga`, [spesialisasi](file:///c:/laragon/www/4CeriaJmbt-riza/app/Models/Kontraktor.php#23-27), `deskripsi`, `lokasi`, `pengalaman_tahun`, timestamps
### 21. `bids_arsitek` *(14 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `project_id`, `arsitek_id`, `price`, `waktu_pengerjaan`, `catatan`, `proposal`, `email_arsitek`, `status`, timestamps

### 22. `kontraktors` *(4 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `user_id`, `nama`, `email`, `no_telepon`, `alamat`, `jenis`, `nama_perusahaan`, `npwp`, `siup`, `pengalaman`, `rate_harga`, timestamps
### 23. `bids_kontraktor` *(9 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `project_id`, `kontraktor_id`, `price`, `waktu_pengerjaan`, `catatan`, `proposal`, `status`, timestamps

### 24. `riwayat_projects` *(5 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `project_id`, `arsitek_id`, `kontraktor_id`, `user_id`, `selesai_pada`, `keterangan`, timestamps

### 25. `project_kontraktor` *(0 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `project_id`, `kontraktor_id`

---

## Verifications & Miscellany
### 26. `arsitek_ratings` *(4 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `user_id`, `arsitek_id`, `project_id`, [rating](file:///c:/laragon/www/4CeriaJmbt-riza/app/Models/Kontraktor.php#36-40), `komentar`, timestamps
### 27. `kontraktor_ratings` *(3 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `user_id`, `kontraktor_id`, `project_id`, [rating](file:///c:/laragon/www/4CeriaJmbt-riza/app/Models/Kontraktor.php#36-40), `komentar`, timestamps

### 28. [spesialisasi](file:///c:/laragon/www/4CeriaJmbt-riza/app/Models/Kontraktor.php#23-27) *(8 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `nama`, timestamps
### 29. `kontraktor_spesialisasi` *(3 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `kontraktor_id`, `spesialisasi_id`
### 30. `pengajuan_spesialisasi` *(8 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `kontraktor_id`, `spesialisasi_id`, `file_sertifikat`, `catatan`, `status`, timestamps

### 31. `detail_user` *(0 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `id_user`, `pic`, timestamps
### 32. `contact` *(0 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `name`, `url`, `banner_dir`, `size`
### 33. `phone_user` *(4 rows)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `contact`, `id_user`, `id_contact`

### 34. `migrations` *(1 row)*
- [id](file:///c:/laragon/www/4CeriaJmbt-riza/app/Http/Controllers/BidKontraktorController.php#21-26), `migration`, `batch`
