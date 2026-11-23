--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31682, 'Giska (Architect)', 'giska@example.test', 'giska', 'F7GRJP', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:37+07', '2026-11-02 12:35:20+07', 'arsitek', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31683, 'Anindia (Contractor)', 'anindia@example.test', 'anindia', 'S7DGWV', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:37+07', '2026-10-02 16:20:37+07', 'kontraktor', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31684, 'Abel (Interior)', 'abel@example.test', 'abel', '5WM9EW', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', 'interior', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31685, 'Rede (Notary)', 'rede@example.test', 'rede', 'UPVXVF', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', 'notaris', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31686, 'Fariz (Courier)', 'fariz@example.test', 'fariz', 'ETBSKR', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', 'user', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31687, 'Akmal (Supplier)', 'akmal@example.test', 'akmal', 'GNYJRT', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', 'user', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31688, 'Aisha (PM)', 'aisha@example.test', 'aisha', 'PX746D', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', 'project_manager', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31689, 'John (Lead PM)', 'pm@4c.id', 'john_pm_lead', 'HZ2QK2', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', 'project_manager', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31690, 'Budi (Structural)', 'budi-struc@example.test', 'budi_struc', 'TMCFSR', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', 'structural', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31691, 'Andi (MEP)', 'andi-mep@example.test', 'andi_mep', 'J9QDNC', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', 'mep', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31692, 'Malya (Project Owner)', 'client@example.test', 'malya', 'ZZ2A53', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-11-02 17:45:10+07', 'user', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31693, 'Davin', 'davin@example.test', 'davin', '7GPLM3', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', 'user', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31694, 'System Admin', 'admin@4c.id', 'admin', 'F25V8J', NULL, '$2y$12$bpVJoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', 'admin', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31695, 'Rudi (Sub-Civil)', 'sub-civil@example.test', 'sub_civil', 'D6NGBZ', NULL, '$2y$12$kWL7RLPtlnvPQqwpJ3jnp.cux9Ckj1yxH3e/3rFUadSlArkfUMP8C', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07', 'civil', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31696, 'Dimas (Sub-Mechanical)', 'sub-mechanical@example.test', 'sub_mechanical', '7W7M7S', NULL, '$2y$12$kWL7RLPtlnvPQqwpJ3jnp.cux9Ckj1yxH3e/3rFUadSlArkfUMP8C', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07', 'mechanical', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31697, 'Wahyu (Sub-Electrical)', 'sub-electrical@example.test', 'sub_electrical', '75BPXU', NULL, '$2y$12$kWL7RLPtlnvPQqwpJ3jnp.cux9Ckj1yxH3e/3rFUadSlArkfUMP8C', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07', 'electrical', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31698, 'Hendra (Sub-Plumbing)', 'sub-plumbing@example.test', 'sub_plumbing', '3APWUE', NULL, '$2y$12$kWL7RLPtlnvPQqwpJ3jnp.cux9Ckj1yxH3e/3rFUadSlArkfUMP8C', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07', 'plumbing', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31699, 'Teguh (Sub-Roofing)', 'sub-roofing@example.test', 'sub_roofing', 'RHLA7A', NULL, '$2y$12$kWL7RLPtlnvPQqwpJ3jnp.cux9Ckj1yxH3e/3rFUadSlArkfUMP8C', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07', 'roofing', false);
INSERT INTO public.users (id, name, email, username, unique_code, email_verified_at, password, pic, firm_name, firm_slogan, firm_banner_path, firm_description, firm_is_hiring, firm_needed_roles, "Deskripsi", bank_name, bank_account_number, bank_account_name, remember_token, created_at, updated_at, role_type, is_suspended) VALUES (31700, 'Agus (Sub-Finishing)', 'sub-finishing@example.test', 'sub_finishing', '6PGUQX', NULL, '$2y$12$kWL7RLPtlnvPQqwpJ3jnp.cux9Ckj1yxH3e/3rFUadSlArkfUMP8C', NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07', 'finishing', false);


--
-- Data for Name: admin; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: arsiteks; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.arsiteks (id, user_id, nama, no_telp, rate_harga, spesialisasi, deskripsi, lokasi, pengalaman_tahun, file_portofolio, file_sertifikat, npwp, siup, pendidikan, alasan_hire, verification_status, rejection_reason, foto, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, reliability_score, created_at, updated_at) VALUES (6634, 31682, 'Giska Modern Architecture', '08123456789', 15000000.00, 'Minimalist, Eco-Friendly, Modern', 'Architectural excellence focused on sustainable and eco-friendly designs with a modern minimalist touch.', 'Jakarta Selatan', 8, 'https://example.com/portfolio-giska.pdf', NULL, NULL, NULL, NULL, NULL, 'verified', NULL, 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1976&auto=format&fit=crop', NULL, NULL, NULL, 'individual', NULL, NULL, 100, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');


--
-- Data for Name: interior_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.interior_profiles (id, user_id, nama, no_telp, foto, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, reliability_score, file_portofolio, file_sertifikat, npwp, siup, spesialisasi, deskripsi, lokasi, pengalaman_tahun, rate_harga, verification_status, rejection_reason, created_at, updated_at) VALUES (377, 31684, 'Abel Chic Interiors', '08312345678', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=1976&auto=format&fit=crop', NULL, NULL, NULL, 'individual', NULL, NULL, 100, 'https://example.com/portfolio-abel.pdf', NULL, NULL, NULL, 'Scandinavian, Mid-Century, Industrial', 'Turning spaces into warm, stylish homes. Specializing in Scandinavian and Mid-century modern interiors.', 'Tangerang Selatan', 5, 10000000.00, 'verified', NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');


--
-- Data for Name: kontraktors; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.kontraktors (id, user_id, nama, no_telepon, alamat, jenis, nama_perusahaan, npwp, siup, pengalaman, spesialisasi, subspecialties, rate_harga, pendidikan, alasan_hire, verification_status, rejection_reason, foto, file_portofolio, file_sertifikat, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, reliability_score, created_at, updated_at) VALUES (6544, 31683, 'Anindia Build Co.', '08212345678', 'Jl. Pembangunan No. 12, Bandung', 'General Contractor', 'PT Anindia Bangun Indonesia', NULL, NULL, 12, 'Residential, Commercial, Industrial', NULL, 50000000.00, NULL, NULL, 'verified', NULL, 'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=1961&auto=format&fit=crop', NULL, NULL, NULL, NULL, NULL, 'individual', NULL, NULL, 100, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');
INSERT INTO public.kontraktors (id, user_id, nama, no_telepon, alamat, jenis, nama_perusahaan, npwp, siup, pengalaman, spesialisasi, subspecialties, rate_harga, pendidikan, alasan_hire, verification_status, rejection_reason, foto, file_portofolio, file_sertifikat, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, reliability_score, created_at, updated_at) VALUES (6545, 31695, 'Rudi (Sub-Civil)', '08229740891', 'Jakarta', 'Sub-Contractor', NULL, NULL, NULL, 7, 'Foundation, Framing, Columns & Beams', NULL, 8534414.00, NULL, NULL, 'verified', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'individual', NULL, NULL, 100, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07');
INSERT INTO public.kontraktors (id, user_id, nama, no_telepon, alamat, jenis, nama_perusahaan, npwp, siup, pengalaman, spesialisasi, subspecialties, rate_harga, pendidikan, alasan_hire, verification_status, rejection_reason, foto, file_portofolio, file_sertifikat, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, reliability_score, created_at, updated_at) VALUES (6546, 31696, 'Dimas (Sub-Mechanical)', '08455890988', 'Jakarta', 'Sub-Contractor', NULL, NULL, NULL, 10, 'HVAC, Elevator, Fire Protection', NULL, 10809171.00, NULL, NULL, 'verified', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'individual', NULL, NULL, 100, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07');
INSERT INTO public.kontraktors (id, user_id, nama, no_telepon, alamat, jenis, nama_perusahaan, npwp, siup, pengalaman, spesialisasi, subspecialties, rate_harga, pendidikan, alasan_hire, verification_status, rejection_reason, foto, file_portofolio, file_sertifikat, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, reliability_score, created_at, updated_at) VALUES (6547, 31697, 'Wahyu (Sub-Electrical)', '08519788700', 'Jakarta', 'Sub-Contractor', NULL, NULL, NULL, 9, 'Power Distribution, Wiring, Panels', NULL, 13707806.00, NULL, NULL, 'verified', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'individual', NULL, NULL, 100, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07');
INSERT INTO public.kontraktors (id, user_id, nama, no_telepon, alamat, jenis, nama_perusahaan, npwp, siup, pengalaman, spesialisasi, subspecialties, rate_harga, pendidikan, alasan_hire, verification_status, rejection_reason, foto, file_portofolio, file_sertifikat, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, reliability_score, created_at, updated_at) VALUES (6548, 31698, 'Hendra (Sub-Plumbing)', '08449758229', 'Jakarta', 'Sub-Contractor', NULL, NULL, NULL, 8, 'Water Supply, Drainage, Sewage', NULL, 8180640.00, NULL, NULL, 'verified', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'individual', NULL, NULL, 100, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07');
INSERT INTO public.kontraktors (id, user_id, nama, no_telepon, alamat, jenis, nama_perusahaan, npwp, siup, pengalaman, spesialisasi, subspecialties, rate_harga, pendidikan, alasan_hire, verification_status, rejection_reason, foto, file_portofolio, file_sertifikat, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, reliability_score, created_at, updated_at) VALUES (6549, 31699, 'Teguh (Sub-Roofing)', '08576063183', 'Jakarta', 'Sub-Contractor', NULL, NULL, NULL, 6, 'Roof Truss, Covering, Waterproofing', NULL, 13332381.00, NULL, NULL, 'verified', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'individual', NULL, NULL, 100, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07');
INSERT INTO public.kontraktors (id, user_id, nama, no_telepon, alamat, jenis, nama_perusahaan, npwp, siup, pengalaman, spesialisasi, subspecialties, rate_harga, pendidikan, alasan_hire, verification_status, rejection_reason, foto, file_portofolio, file_sertifikat, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, reliability_score, created_at, updated_at) VALUES (6550, 31700, 'Agus (Sub-Finishing)', '08738788467', 'Jakarta', 'Sub-Contractor', NULL, NULL, NULL, 8, 'Plastering, Painting, Tiling, Facade', NULL, 5432190.00, NULL, NULL, 'verified', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'individual', NULL, NULL, 100, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07');


--
-- Data for Name: mep_engineers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.mep_engineers (id, user_id, nama, no_telp, rate_harga, reliability_score, spesialisasi, deskripsi, lokasi, pengalaman_tahun, file_portofolio, file_sertifikat, npwp, siup, pendidikan, alasan_hire, verification_status, rejection_reason, foto, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, created_at, updated_at) VALUES (591, 31691, 'Andi MEP Solutions', '08612345678', 8000000.00, 100, 'Electrical, Plumbing, HVAC', 'Comprehensive MEP engineering for modern smart homes.', 'Surabaya', 7, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, NULL, NULL, NULL, NULL, 'individual', NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');


--
-- Data for Name: notaris_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.notaris_profiles (id, user_id, nama, no_telp, foto, file_portofolio, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, reliability_score, nomor_sk, wilayah_kerja, spesialisasi, deskripsi, lokasi, pengalaman_tahun, rate_harga, file_sertifikat, npwp, siup, verification_status, rejection_reason, created_at, updated_at) VALUES (564, 31685, 'Notaris Rede, S.H., M.Kn.', '08412345678', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=1974&auto=format&fit=crop', NULL, NULL, NULL, NULL, 'individual', NULL, NULL, 100, 'SK-2023-NOT-999', 'DKI Jakarta', 'Property Law, Corporate Law', 'Specialist in property law and large-scale land acquisition.', 'Jakarta Pusat', 15, 5000000.00, NULL, NULL, NULL, 'verified', NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');


--
-- Data for Name: project_managers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.project_managers (id, user_id, nama, no_telp, rate_harga, spesialisasi, deskripsi, lokasi, pengalaman_tahun, file_portofolio, file_sertifikat, npwp, siup, pendidikan, alasan_hire, verification_status, rejection_reason, foto, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, reliability_score, created_at, updated_at) VALUES (830, 31688, 'Aisha Project Management', '08712345678', 20000000.00, 'Agile Construction, Risk Management', 'Ensuring project delivery on time and within budget.', 'Jakarta', 9, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, NULL, NULL, NULL, NULL, 'individual', NULL, NULL, 100, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');
INSERT INTO public.project_managers (id, user_id, nama, no_telp, rate_harga, spesialisasi, deskripsi, lokasi, pengalaman_tahun, file_portofolio, file_sertifikat, npwp, siup, pendidikan, alasan_hire, verification_status, rejection_reason, foto, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, reliability_score, created_at, updated_at) VALUES (831, 31689, 'John (Lead Project Manager)', '08771234567', 25000000.00, 'Financial Oversight & Construction Management', 'Senior PM with expertise in budget stabilization and technical auditing.', 'Jakarta Barat', 12, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, NULL, NULL, NULL, NULL, 'individual', NULL, NULL, 100, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');


--
-- Data for Name: structural_engineers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.structural_engineers (id, user_id, nama, no_telp, rate_harga, reliability_score, spesialisasi, deskripsi, lokasi, pengalaman_tahun, file_portofolio, file_sertifikat, npwp, siup, pendidikan, alasan_hire, verification_status, rejection_reason, foto, identity_number, npwp_number, siup_number, entity_type, company_name, company_license, created_at, updated_at) VALUES (1079, 31690, 'Budi Structural & Civil', '08512345678', 12000000.00, 100, 'High-Rise, Steel Structures', 'Expert in structural integrity and earthquake-resistant designs.', 'Bandung', 10, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, NULL, NULL, NULL, NULL, 'individual', NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.projects (id, user_id, title, description, budget, lokasi, jenis_proyek, owner_id, selected_arsitek_id, selected_kontraktor_id, selected_notaris_id, selected_interior_id, pm_id, structural_id, mep_id, structural_approved_at, mep_approved_at, status, published_bidding_roles, bidding_choices, target_role, needed_phases, completed_phases, wants_project_manager, requires_structural, requires_mep, requires_interior, latitude, longitude, province, city, kecamatan, kelurahan, postal_code, street_name, design_details, design_completed_at, design_authorized_at, materials_authorized_at, design_locked_at, legal_completed_at, pbg_verified_at, slf_verified_at, legal_locked_at, construction_details, construction_completed_at, construction_authorized_at, construction_locked_at, construction_brief_status, construction_brief_revision_notes, interior_details, interior_locked_at, interior_completed_at, planning_status, negotiated_fee, payment_instructions, planning_submitted_at, planning_approved_at, design_payment_verified_at, construction_payment_verified_at, interior_payment_verified_at, arsitek_kickoff_at, kontraktor_kickoff_at, pm_audit_notes, pm_audit_attachments, architect_notes, planning_iteration, project_category, project_dimensions, legal_detail, wants_to_discuss_later, legal_requirements, share_token, attachment, deadline, created_at, updated_at, design_handover_submitted_at, construction_handover_submitted_at, interior_handover_submitted_at, design_handover_notes, construction_handover_notes, interior_handover_notes, legal_handover_submitted_at, legal_handover_notes, final_walkthrough_at, walkthrough_status, completed_at, owner_accepted_at, owner_acceptance_notes, owner_design_approved_at, owner_build_approved_at, owner_interior_approved_at, owner_legal_approved_at, warranty_start_at, warranty_end_at, deleted_at, planning_pm_verified_at) VALUES (14970, 31682, 'Modern Minimalist Villa in Ubud', 'A successfully completed project showcasing professional excellence and attention to detail.', 145319298.00, 'Professional Showroom', 'umum', NULL, 6634, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'accepted_arsitek', '[]', NULL, 'arsitek', NULL, NULL, false, false, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.projects (id, user_id, title, description, budget, lokasi, jenis_proyek, owner_id, selected_arsitek_id, selected_kontraktor_id, selected_notaris_id, selected_interior_id, pm_id, structural_id, mep_id, structural_approved_at, mep_approved_at, status, published_bidding_roles, bidding_choices, target_role, needed_phases, completed_phases, wants_project_manager, requires_structural, requires_mep, requires_interior, latitude, longitude, province, city, kecamatan, kelurahan, postal_code, street_name, design_details, design_completed_at, design_authorized_at, materials_authorized_at, design_locked_at, legal_completed_at, pbg_verified_at, slf_verified_at, legal_locked_at, construction_details, construction_completed_at, construction_authorized_at, construction_locked_at, construction_brief_status, construction_brief_revision_notes, interior_details, interior_locked_at, interior_completed_at, planning_status, negotiated_fee, payment_instructions, planning_submitted_at, planning_approved_at, design_payment_verified_at, construction_payment_verified_at, interior_payment_verified_at, arsitek_kickoff_at, kontraktor_kickoff_at, pm_audit_notes, pm_audit_attachments, architect_notes, planning_iteration, project_category, project_dimensions, legal_detail, wants_to_discuss_later, legal_requirements, share_token, attachment, deadline, created_at, updated_at, design_handover_submitted_at, construction_handover_submitted_at, interior_handover_submitted_at, design_handover_notes, construction_handover_notes, interior_handover_notes, legal_handover_submitted_at, legal_handover_notes, final_walkthrough_at, walkthrough_status, completed_at, owner_accepted_at, owner_acceptance_notes, owner_design_approved_at, owner_build_approved_at, owner_interior_approved_at, owner_legal_approved_at, warranty_start_at, warranty_end_at, deleted_at, planning_pm_verified_at) VALUES (14971, 31682, 'Sustainable Eco-Resort Concept', 'A successfully completed project showcasing professional excellence and attention to detail.', 43374554.00, 'Professional Showroom', 'umum', NULL, 6634, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'completed', '[]', NULL, 'arsitek', NULL, NULL, false, false, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.projects (id, user_id, title, description, budget, lokasi, jenis_proyek, owner_id, selected_arsitek_id, selected_kontraktor_id, selected_notaris_id, selected_interior_id, pm_id, structural_id, mep_id, structural_approved_at, mep_approved_at, status, published_bidding_roles, bidding_choices, target_role, needed_phases, completed_phases, wants_project_manager, requires_structural, requires_mep, requires_interior, latitude, longitude, province, city, kecamatan, kelurahan, postal_code, street_name, design_details, design_completed_at, design_authorized_at, materials_authorized_at, design_locked_at, legal_completed_at, pbg_verified_at, slf_verified_at, legal_locked_at, construction_details, construction_completed_at, construction_authorized_at, construction_locked_at, construction_brief_status, construction_brief_revision_notes, interior_details, interior_locked_at, interior_completed_at, planning_status, negotiated_fee, payment_instructions, planning_submitted_at, planning_approved_at, design_payment_verified_at, construction_payment_verified_at, interior_payment_verified_at, arsitek_kickoff_at, kontraktor_kickoff_at, pm_audit_notes, pm_audit_attachments, architect_notes, planning_iteration, project_category, project_dimensions, legal_detail, wants_to_discuss_later, legal_requirements, share_token, attachment, deadline, created_at, updated_at, design_handover_submitted_at, construction_handover_submitted_at, interior_handover_submitted_at, design_handover_notes, construction_handover_notes, interior_handover_notes, legal_handover_submitted_at, legal_handover_notes, final_walkthrough_at, walkthrough_status, completed_at, owner_accepted_at, owner_acceptance_notes, owner_design_approved_at, owner_build_approved_at, owner_interior_approved_at, owner_legal_approved_at, warranty_start_at, warranty_end_at, deleted_at, planning_pm_verified_at) VALUES (14972, 31682, 'Industrial Warehouse Renovation', 'A successfully completed project showcasing professional excellence and attention to detail.', 30089588.00, 'Professional Showroom', 'umum', NULL, NULL, 6544, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'completed', '[]', NULL, 'kontraktor', NULL, NULL, false, false, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.projects (id, user_id, title, description, budget, lokasi, jenis_proyek, owner_id, selected_arsitek_id, selected_kontraktor_id, selected_notaris_id, selected_interior_id, pm_id, structural_id, mep_id, structural_approved_at, mep_approved_at, status, published_bidding_roles, bidding_choices, target_role, needed_phases, completed_phases, wants_project_manager, requires_structural, requires_mep, requires_interior, latitude, longitude, province, city, kecamatan, kelurahan, postal_code, street_name, design_details, design_completed_at, design_authorized_at, materials_authorized_at, design_locked_at, legal_completed_at, pbg_verified_at, slf_verified_at, legal_locked_at, construction_details, construction_completed_at, construction_authorized_at, construction_locked_at, construction_brief_status, construction_brief_revision_notes, interior_details, interior_locked_at, interior_completed_at, planning_status, negotiated_fee, payment_instructions, planning_submitted_at, planning_approved_at, design_payment_verified_at, construction_payment_verified_at, interior_payment_verified_at, arsitek_kickoff_at, kontraktor_kickoff_at, pm_audit_notes, pm_audit_attachments, architect_notes, planning_iteration, project_category, project_dimensions, legal_detail, wants_to_discuss_later, legal_requirements, share_token, attachment, deadline, created_at, updated_at, design_handover_submitted_at, construction_handover_submitted_at, interior_handover_submitted_at, design_handover_notes, construction_handover_notes, interior_handover_notes, legal_handover_submitted_at, legal_handover_notes, final_walkthrough_at, walkthrough_status, completed_at, owner_accepted_at, owner_acceptance_notes, owner_design_approved_at, owner_build_approved_at, owner_interior_approved_at, owner_legal_approved_at, warranty_start_at, warranty_end_at, deleted_at, planning_pm_verified_at) VALUES (14973, 31682, 'Scandinavian Living Room Makeover', 'A successfully completed project showcasing professional excellence and attention to detail.', 101680345.00, 'Professional Showroom', 'umum', NULL, NULL, NULL, NULL, 377, NULL, NULL, NULL, NULL, NULL, 'completed', '[]', NULL, 'arsitek', NULL, NULL, false, false, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.projects (id, user_id, title, description, budget, lokasi, jenis_proyek, owner_id, selected_arsitek_id, selected_kontraktor_id, selected_notaris_id, selected_interior_id, pm_id, structural_id, mep_id, structural_approved_at, mep_approved_at, status, published_bidding_roles, bidding_choices, target_role, needed_phases, completed_phases, wants_project_manager, requires_structural, requires_mep, requires_interior, latitude, longitude, province, city, kecamatan, kelurahan, postal_code, street_name, design_details, design_completed_at, design_authorized_at, materials_authorized_at, design_locked_at, legal_completed_at, pbg_verified_at, slf_verified_at, legal_locked_at, construction_details, construction_completed_at, construction_authorized_at, construction_locked_at, construction_brief_status, construction_brief_revision_notes, interior_details, interior_locked_at, interior_completed_at, planning_status, negotiated_fee, payment_instructions, planning_submitted_at, planning_approved_at, design_payment_verified_at, construction_payment_verified_at, interior_payment_verified_at, arsitek_kickoff_at, kontraktor_kickoff_at, pm_audit_notes, pm_audit_attachments, architect_notes, planning_iteration, project_category, project_dimensions, legal_detail, wants_to_discuss_later, legal_requirements, share_token, attachment, deadline, created_at, updated_at, design_handover_submitted_at, construction_handover_submitted_at, interior_handover_submitted_at, design_handover_notes, construction_handover_notes, interior_handover_notes, legal_handover_submitted_at, legal_handover_notes, final_walkthrough_at, walkthrough_status, completed_at, owner_accepted_at, owner_acceptance_notes, owner_design_approved_at, owner_build_approved_at, owner_interior_approved_at, owner_legal_approved_at, warranty_start_at, warranty_end_at, deleted_at, planning_pm_verified_at) VALUES (14974, 31682, 'Chic Mid-Century Office Space', 'A successfully completed project showcasing professional excellence and attention to detail.', 64640599.00, 'Professional Showroom', 'umum', NULL, NULL, NULL, NULL, 377, NULL, NULL, NULL, NULL, NULL, 'completed', '[]', NULL, 'arsitek', NULL, NULL, false, false, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.projects (id, user_id, title, description, budget, lokasi, jenis_proyek, owner_id, selected_arsitek_id, selected_kontraktor_id, selected_notaris_id, selected_interior_id, pm_id, structural_id, mep_id, structural_approved_at, mep_approved_at, status, published_bidding_roles, bidding_choices, target_role, needed_phases, completed_phases, wants_project_manager, requires_structural, requires_mep, requires_interior, latitude, longitude, province, city, kecamatan, kelurahan, postal_code, street_name, design_details, design_completed_at, design_authorized_at, materials_authorized_at, design_locked_at, legal_completed_at, pbg_verified_at, slf_verified_at, legal_locked_at, construction_details, construction_completed_at, construction_authorized_at, construction_locked_at, construction_brief_status, construction_brief_revision_notes, interior_details, interior_locked_at, interior_completed_at, planning_status, negotiated_fee, payment_instructions, planning_submitted_at, planning_approved_at, design_payment_verified_at, construction_payment_verified_at, interior_payment_verified_at, arsitek_kickoff_at, kontraktor_kickoff_at, pm_audit_notes, pm_audit_attachments, architect_notes, planning_iteration, project_category, project_dimensions, legal_detail, wants_to_discuss_later, legal_requirements, share_token, attachment, deadline, created_at, updated_at, design_handover_submitted_at, construction_handover_submitted_at, interior_handover_submitted_at, design_handover_notes, construction_handover_notes, interior_handover_notes, legal_handover_submitted_at, legal_handover_notes, final_walkthrough_at, walkthrough_status, completed_at, owner_accepted_at, owner_acceptance_notes, owner_design_approved_at, owner_build_approved_at, owner_interior_approved_at, owner_legal_approved_at, warranty_start_at, warranty_end_at, deleted_at, planning_pm_verified_at) VALUES (14975, 31692, 'Stabilization Test Project (Legal Phase)', 'A test project specifically for verifying the Legal Ledger and Disbursement flow.', 5000000000.00, 'Pondok Indah, Jakarta', 'umum', NULL, NULL, NULL, 564, NULL, 831, NULL, NULL, NULL, NULL, 'legal', '[]', NULL, 'both', NULL, NULL, false, false, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.projects (id, user_id, title, description, budget, lokasi, jenis_proyek, owner_id, selected_arsitek_id, selected_kontraktor_id, selected_notaris_id, selected_interior_id, pm_id, structural_id, mep_id, structural_approved_at, mep_approved_at, status, published_bidding_roles, bidding_choices, target_role, needed_phases, completed_phases, wants_project_manager, requires_structural, requires_mep, requires_interior, latitude, longitude, province, city, kecamatan, kelurahan, postal_code, street_name, design_details, design_completed_at, design_authorized_at, materials_authorized_at, design_locked_at, legal_completed_at, pbg_verified_at, slf_verified_at, legal_locked_at, construction_details, construction_completed_at, construction_authorized_at, construction_locked_at, construction_brief_status, construction_brief_revision_notes, interior_details, interior_locked_at, interior_completed_at, planning_status, negotiated_fee, payment_instructions, planning_submitted_at, planning_approved_at, design_payment_verified_at, construction_payment_verified_at, interior_payment_verified_at, arsitek_kickoff_at, kontraktor_kickoff_at, pm_audit_notes, pm_audit_attachments, architect_notes, planning_iteration, project_category, project_dimensions, legal_detail, wants_to_discuss_later, legal_requirements, share_token, attachment, deadline, created_at, updated_at, design_handover_submitted_at, construction_handover_submitted_at, interior_handover_submitted_at, design_handover_notes, construction_handover_notes, interior_handover_notes, legal_handover_submitted_at, legal_handover_notes, final_walkthrough_at, walkthrough_status, completed_at, owner_accepted_at, owner_acceptance_notes, owner_design_approved_at, owner_build_approved_at, owner_interior_approved_at, owner_legal_approved_at, warranty_start_at, warranty_end_at, deleted_at, planning_pm_verified_at) VALUES (14976, 31692, 'Demo: Two-storey house - design and build open for bids', 'Demo project. Two-storey house on a 400 m2 lot in Bekasi: architectural design, structural, and build in two phases. Open for bids from architects and contractors.', 850000000.00, 'Bekasi, Jawa Barat', 'rumah', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'open', '["project_manager", "arsitek", "kontraktor"]', '{"arsitek": "find", "kontraktor": "find", "project_manager": "find"}', 'both', '["design", "build"]', NULL, true, false, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-11-02 13:58:04+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.projects (id, user_id, title, description, budget, lokasi, jenis_proyek, owner_id, selected_arsitek_id, selected_kontraktor_id, selected_notaris_id, selected_interior_id, pm_id, structural_id, mep_id, structural_approved_at, mep_approved_at, status, published_bidding_roles, bidding_choices, target_role, needed_phases, completed_phases, wants_project_manager, requires_structural, requires_mep, requires_interior, latitude, longitude, province, city, kecamatan, kelurahan, postal_code, street_name, design_details, design_completed_at, design_authorized_at, materials_authorized_at, design_locked_at, legal_completed_at, pbg_verified_at, slf_verified_at, legal_locked_at, construction_details, construction_completed_at, construction_authorized_at, construction_locked_at, construction_brief_status, construction_brief_revision_notes, interior_details, interior_locked_at, interior_completed_at, planning_status, negotiated_fee, payment_instructions, planning_submitted_at, planning_approved_at, design_payment_verified_at, construction_payment_verified_at, interior_payment_verified_at, arsitek_kickoff_at, kontraktor_kickoff_at, pm_audit_notes, pm_audit_attachments, architect_notes, planning_iteration, project_category, project_dimensions, legal_detail, wants_to_discuss_later, legal_requirements, share_token, attachment, deadline, created_at, updated_at, design_handover_submitted_at, construction_handover_submitted_at, interior_handover_submitted_at, design_handover_notes, construction_handover_notes, interior_handover_notes, legal_handover_submitted_at, legal_handover_notes, final_walkthrough_at, walkthrough_status, completed_at, owner_accepted_at, owner_acceptance_notes, owner_design_approved_at, owner_build_approved_at, owner_interior_approved_at, owner_legal_approved_at, warranty_start_at, warranty_end_at, deleted_at, planning_pm_verified_at) VALUES (14977, 31692, 'Demo: Notarisation and land documents, BSD pending', 'Demo project. Notarisation of the sale deed and the land certificate (SHM) transfer for a ready house in Tangerang.', 25000000.00, 'Tangerang, Banten', 'tanah', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'open', '["notaris"]', '{"notaris": "cert_only"}', 'arsitek', '["legal"]', NULL, false, false, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, 'draft', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-30 16:18:04+07', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: arsitek_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: bid_negotiation_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: bids; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.bids (id, project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, kontraktor_id, notaris_id, interior_id, pm_id, structural_id, mep_id, price, price_max, negotiation_count, fee_type, unit_price, quantity, calculated_total, proposal, status, is_recommended, estimated_duration, duration_unit, attachment_1, attachment_2, attachment_3, payment_status, paid_at, scopes, deliverables, created_at, updated_at, offered_by_id, fee_agreed_at, payment_proof_path, verification_notes, proposed_termins, proposed_milestones, refunded_amount, proposed_team, style, construction_method, cost_breakdown, workforce_count, equipment_owned, warranty_months, payment_preference, tax_estimate, fee_percentage, selected_services, license_number, experience_years, technical_notes, interview_notes, legacy_id) VALUES (1, 14976, 'arsitek', 31682, 6634, 6634, NULL, NULL, NULL, NULL, NULL, NULL, 68000000.00, NULL, 0, 'fixed', NULL, NULL, NULL, 'Demo bid. Concept design, 3D views, and a permit-ready drawing set. Design in 5 weeks, one revision round included.', 'pending', true, 5, 'weeks', NULL, NULL, NULL, 'unpaid', NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07', 31682, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2587);
INSERT INTO public.bids (id, project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, kontraktor_id, notaris_id, interior_id, pm_id, structural_id, mep_id, price, price_max, negotiation_count, fee_type, unit_price, quantity, calculated_total, proposal, status, is_recommended, estimated_duration, duration_unit, attachment_1, attachment_2, attachment_3, payment_status, paid_at, scopes, deliverables, created_at, updated_at, offered_by_id, fee_agreed_at, payment_proof_path, verification_notes, proposed_termins, proposed_milestones, refunded_amount, proposed_team, style, construction_method, cost_breakdown, workforce_count, equipment_owned, warranty_months, payment_preference, tax_estimate, fee_percentage, selected_services, license_number, experience_years, technical_notes, interview_notes, legacy_id) VALUES (2, 14976, 'kontraktor', 31683, 6544, NULL, 6544, NULL, NULL, NULL, NULL, NULL, 640000000.00, NULL, 0, 'fixed', NULL, NULL, NULL, 'Demo bid. Full build across two phases, materials quoted per stage, structural and MEP by certified sub-contractors.', 'pending', false, 7, 'months', NULL, NULL, NULL, 'unpaid', NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07', 31683, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 962);
INSERT INTO public.bids (id, project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, kontraktor_id, notaris_id, interior_id, pm_id, structural_id, mep_id, price, price_max, negotiation_count, fee_type, unit_price, quantity, calculated_total, proposal, status, is_recommended, estimated_duration, duration_unit, attachment_1, attachment_2, attachment_3, payment_status, paid_at, scopes, deliverables, created_at, updated_at, offered_by_id, fee_agreed_at, payment_proof_path, verification_notes, proposed_termins, proposed_milestones, refunded_amount, proposed_team, style, construction_method, cost_breakdown, workforce_count, equipment_owned, warranty_months, payment_preference, tax_estimate, fee_percentage, selected_services, license_number, experience_years, technical_notes, interview_notes, legacy_id) VALUES (3, 14975, 'notaris', 31685, 564, NULL, NULL, 564, NULL, NULL, NULL, NULL, 15000000.00, NULL, 0, 'fixed', NULL, NULL, NULL, 'Legal handling for luxury residential project.', 'accepted', false, 30, 'days', NULL, NULL, NULL, 'unpaid', NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07', NULL, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 50000000.00, NULL, NULL, NULL, NULL, NULL, NULL, 97);
INSERT INTO public.bids (id, project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, kontraktor_id, notaris_id, interior_id, pm_id, structural_id, mep_id, price, price_max, negotiation_count, fee_type, unit_price, quantity, calculated_total, proposal, status, is_recommended, estimated_duration, duration_unit, attachment_1, attachment_2, attachment_3, payment_status, paid_at, scopes, deliverables, created_at, updated_at, offered_by_id, fee_agreed_at, payment_proof_path, verification_notes, proposed_termins, proposed_milestones, refunded_amount, proposed_team, style, construction_method, cost_breakdown, workforce_count, equipment_owned, warranty_months, payment_preference, tax_estimate, fee_percentage, selected_services, license_number, experience_years, technical_notes, interview_notes, legacy_id) VALUES (4, 14977, 'notaris', 31685, 564, NULL, NULL, 564, NULL, NULL, NULL, NULL, 6500000.00, NULL, 0, 'fixed', NULL, NULL, NULL, 'Demo bid. AJPP, deed of sale and the SHM transfer, with the land-certificate check and tax filing handled.', 'pending', false, 3, 'weeks', NULL, NULL, NULL, 'unpaid', NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-30 16:18:04+07', 31685, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 98);
INSERT INTO public.bids (id, project_id, role, bidder_user_id, bidder_profile_id, arsitek_id, kontraktor_id, notaris_id, interior_id, pm_id, structural_id, mep_id, price, price_max, negotiation_count, fee_type, unit_price, quantity, calculated_total, proposal, status, is_recommended, estimated_duration, duration_unit, attachment_1, attachment_2, attachment_3, payment_status, paid_at, scopes, deliverables, created_at, updated_at, offered_by_id, fee_agreed_at, payment_proof_path, verification_notes, proposed_termins, proposed_milestones, refunded_amount, proposed_team, style, construction_method, cost_breakdown, workforce_count, equipment_owned, warranty_months, payment_preference, tax_estimate, fee_percentage, selected_services, license_number, experience_years, technical_notes, interview_notes, legacy_id) VALUES (5, 14976, 'interior', 31684, 377, NULL, NULL, NULL, 377, NULL, NULL, NULL, 61000000.00, NULL, 0, 'fixed', NULL, NULL, NULL, 'Demo bid. Space planning, lighting and material selection alongside the architectural set, to keep the interior decisions from stalling the build.', 'pending', false, 4, 'weeks', NULL, NULL, NULL, 'unpaid', NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-30 07:43:33+07', 31684, NULL, NULL, NULL, NULL, NULL, 0.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 97);


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: contact; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: contractor_subspecialties; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.contractor_subspecialties (id, slug, label, label_id, category, icon, created_at, updated_at) VALUES (1, 'roofing', 'Roofing Specialist', 'Spesialis Atap', 'construction', 'roof', '2026-09-29 23:14:33+07', '2026-09-29 23:14:33+07');
INSERT INTO public.contractor_subspecialties (id, slug, label, label_id, category, icon, created_at, updated_at) VALUES (2, 'pool', 'Pool Builder', 'Pembangun Kolam', 'construction', 'pool', '2026-09-29 23:14:33+07', '2026-09-29 23:14:33+07');
INSERT INTO public.contractor_subspecialties (id, slug, label, label_id, category, icon, created_at, updated_at) VALUES (3, 'foundation', 'Foundation Specialist', 'Spesialis Pondasi', 'construction', 'foundation', '2026-09-29 23:14:33+07', '2026-09-29 23:14:33+07');
INSERT INTO public.contractor_subspecialties (id, slug, label, label_id, category, icon, created_at, updated_at) VALUES (4, 'steel_structure', 'Steel Structure', 'Struktur Baja', 'construction', 'steel', '2026-09-29 23:14:33+07', '2026-09-29 23:14:33+07');
INSERT INTO public.contractor_subspecialties (id, slug, label, label_id, category, icon, created_at, updated_at) VALUES (5, 'hvac', 'HVAC Installer', 'Instalasi HVAC', 'mechanical', 'hvac', '2026-09-29 23:14:33+07', '2026-09-29 23:14:33+07');
INSERT INTO public.contractor_subspecialties (id, slug, label, label_id, category, icon, created_at, updated_at) VALUES (6, 'electrical_specialist', 'Electrical Specialist', 'Spesialis Listrik', 'mechanical', 'electric', '2026-09-29 23:14:33+07', '2026-09-29 23:14:33+07');
INSERT INTO public.contractor_subspecialties (id, slug, label, label_id, category, icon, created_at, updated_at) VALUES (7, 'plumbing_specialist', 'Plumbing Specialist', 'Spesialis Plumbing', 'mechanical', 'plumbing', '2026-09-29 23:14:33+07', '2026-09-29 23:14:33+07');
INSERT INTO public.contractor_subspecialties (id, slug, label, label_id, category, icon, created_at, updated_at) VALUES (8, 'waterproofing', 'Waterproofing', 'Waterproofing', 'finishing', 'water', '2026-09-29 23:14:33+07', '2026-09-29 23:14:33+07');
INSERT INTO public.contractor_subspecialties (id, slug, label, label_id, category, icon, created_at, updated_at) VALUES (9, 'glass_facade', 'Glass & Facade', 'Kaca & Fasad', 'finishing', 'glass', '2026-09-29 23:14:33+07', '2026-09-29 23:14:33+07');
INSERT INTO public.contractor_subspecialties (id, slug, label, label_id, category, icon, created_at, updated_at) VALUES (10, 'painting', 'Painting & Finishing', 'Pengecatan & Finishing', 'finishing', 'paint', '2026-09-29 23:14:33+07', '2026-09-29 23:14:33+07');


--
-- Data for Name: courier_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.courier_profiles (id, user_id, vehicle_type, license_plate, is_active, created_at, updated_at, verification_status, rejection_reason) VALUES (1, 31686, 'Pickup Truck (L300)', 'B 4122 CER', true, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', 'pending', NULL);


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.suppliers (id, user_id, store_name, address, no_telp, category, bio, verification_status, rejection_reason, foto, created_at, updated_at, detail_location, latitude, longitude) VALUES (1093, 31687, 'Akmal Elite Interior & Furniture', 'Mall Alam Sutera, GF 12, Tangerang', NULL, 'Interior', 'Premium furniture and decor curated for modern living.', 'verified', NULL, 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?q=80&w=2070&auto=format&fit=crop', '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07', NULL, NULL, NULL);


--
-- Data for Name: material_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: material_quotes; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: delivery_jobs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_terminations; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_disputes; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: dispute_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: favorites; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: firm_members; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: house; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: house_questions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: house_answers; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: house_pic; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: interior_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: kontraktor_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: spesialisasi; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: kontraktor_spesialisasi; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: mail_outbox; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: materials; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.materials (id, supplier_id, name, description, price, unit, category, stock, is_available, image_path, specifications, created_at, updated_at) VALUES (272, 1093, 'Luxurious Scandinavian Grey Sofa', 'A luxurious 3-seater sofa with premium velvet finish and solid oak legs.', 7500000.00, 'piece', 'Furniture', 10, true, 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=2070&auto=format&fit=crop', '{"Material": "Velvet, Solid Wood", "Dimensions": "220 x 90 x 85 cm"}', '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');
INSERT INTO public.materials (id, supplier_id, name, description, price, unit, category, stock, is_available, image_path, specifications, created_at, updated_at) VALUES (273, 1093, 'Minimalist Coffee Table Set', 'Real Carrara marble top with industrial steel frame.', 3200000.00, 'piece', 'Furniture', 5, true, 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?q=80&w=2069&auto=format&fit=crop', '{"Material": "Marble, Steel", "Dimensions": "100 x 60 x 45 cm"}', '2026-10-02 16:20:38+07', '2026-11-02 11:15:04+07');


--
-- Data for Name: material_images; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: material_order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: material_order_reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.permissions (id, name, guard_name, created_at, updated_at) VALUES (1, 'user-edit', 'web', '2026-10-02 16:20:37+07', '2026-10-02 16:20:37+07');
INSERT INTO public.permissions (id, name, guard_name, created_at, updated_at) VALUES (2, 'user-view', 'web', '2026-10-02 16:20:37+07', '2026-10-02 16:20:37+07');
INSERT INTO public.permissions (id, name, guard_name, created_at, updated_at) VALUES (3, 'house-view', 'web', '2026-10-02 16:20:37+07', '2026-10-02 16:20:37+07');
INSERT INTO public.permissions (id, name, guard_name, created_at, updated_at) VALUES (4, 'house-detail', 'web', '2026-10-02 16:20:37+07', '2026-10-02 16:20:37+07');


--
-- Data for Name: model_has_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (1, 'notaris', 'web', '2026-09-29 23:13:51+07', '2026-09-29 23:13:51+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (2, 'interior', 'web', '2026-09-29 23:13:52+07', '2026-09-29 23:13:52+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (415, 'admin', 'web', '2026-10-02 16:20:37+07', '2026-10-02 16:20:37+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (416, 'user', 'web', '2026-10-02 16:20:37+07', '2026-10-02 16:20:37+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (417, 'arsitek', 'web', '2026-10-02 16:20:37+07', '2026-10-02 16:20:37+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (418, 'kontraktor', 'web', '2026-10-02 16:20:37+07', '2026-10-02 16:20:37+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (419, 'project_manager', 'web', '2026-10-02 16:20:37+07', '2026-10-02 16:20:37+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (420, 'mep', 'web', '2026-10-02 16:20:37+07', '2026-10-02 16:20:37+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (421, 'structural', 'web', '2026-10-02 16:20:37+07', '2026-10-02 16:20:37+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (422, 'civil', 'web', '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (423, 'mechanical', 'web', '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (424, 'electrical', 'web', '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (425, 'plumbing', 'web', '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (426, 'roofing', 'web', '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07');
INSERT INTO public.roles (id, name, guard_name, created_at, updated_at) VALUES (427, 'finishing', 'web', '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07');


--
-- Data for Name: model_has_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (417, 'App\Models\User', 31682);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (418, 'App\Models\User', 31683);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (2, 'App\Models\User', 31684);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (1, 'App\Models\User', 31685);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (416, 'App\Models\User', 31686);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (416, 'App\Models\User', 31687);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (419, 'App\Models\User', 31688);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (419, 'App\Models\User', 31689);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (421, 'App\Models\User', 31690);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (420, 'App\Models\User', 31691);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (416, 'App\Models\User', 31692);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (416, 'App\Models\User', 31693);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (415, 'App\Models\User', 31694);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (422, 'App\Models\User', 31695);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (423, 'App\Models\User', 31696);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (424, 'App\Models\User', 31697);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (425, 'App\Models\User', 31698);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (426, 'App\Models\User', 31699);
INSERT INTO public.model_has_roles (role_id, model_type, model_id) VALUES (427, 'App\Models\User', 31700);


--
-- Data for Name: notaris_consultations; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: notaris_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: notaris_services; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.notaris_services (id, notaris_id, title, price, description, created_at, updated_at) VALUES (1, 564, 'AJB & Balik Nama', 5000000.00, 'Professional handling of Akta Jual Beli and transfer of title with BPN.', '2026-11-02 19:13:32+07', '2026-11-02 19:13:32+07');
INSERT INTO public.notaris_services (id, notaris_id, title, price, description, created_at, updated_at) VALUES (2, 564, 'PBG (IMB) Permit', 7500000.00, 'Complete processing of Building Approval (PBG/IMB) according to local regulations.', '2026-11-02 19:13:32+07', '2026-11-02 19:13:32+07');
INSERT INTO public.notaris_services (id, notaris_id, title, price, description, created_at, updated_at) VALUES (3, 564, 'SLF Certification', 3000000.00, 'Certificate of Functional Worth (SLF) verification and processing for property legality.', '2026-11-02 19:13:32+07', '2026-11-02 19:13:32+07');


--
-- Data for Name: notification_preferences; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.notifications (id, user_id, type, title, body, data, read_at, created_at, updated_at) VALUES (900058459, 31682, 'payment_verified', 'Payment Verified', 'Your Rp 2.000.000 payment for "Arsitek bid" on "Modern Minimalist Villa in Ubud" has been verified.', '{"payment_id": 900012797, "project_id": 14970, "payment_type": "arsitek_bid"}', NULL, '2026-10-30 01:57:06+07', '2026-10-30 01:57:06+07');
INSERT INTO public.notifications (id, user_id, type, title, body, data, read_at, created_at, updated_at) VALUES (900058460, 31694, 'payment_verified', 'Payment Confirmed', 'The Rp 2.000.000 payment for "Arsitek bid" has been confirmed by the payer.', '{"payment_id": 900012797, "project_id": 14970, "payment_type": "arsitek_bid"}', NULL, '2026-10-30 01:57:06+07', '2026-10-30 01:57:06+07');
INSERT INTO public.notifications (id, user_id, type, title, body, data, read_at, created_at, updated_at) VALUES (900058464, 31682, 'payment_verified', 'Payment Verified', 'Your Rp 2.000.000 payment for "Arsitek bid" on "Modern Minimalist Villa in Ubud" has been verified.', '{"payment_id": 900012797, "project_id": 14970, "payment_type": "arsitek_bid"}', NULL, '2026-10-30 01:57:44+07', '2026-10-30 01:57:44+07');
INSERT INTO public.notifications (id, user_id, type, title, body, data, read_at, created_at, updated_at) VALUES (900058465, 31694, 'payment_verified', 'Payment Confirmed', 'The Rp 2.000.000 payment for "Arsitek bid" has been confirmed by the payer.', '{"payment_id": 900012797, "project_id": 14970, "payment_type": "arsitek_bid"}', NULL, '2026-10-30 01:57:44+07', '2026-10-30 01:57:44+07');
INSERT INTO public.notifications (id, user_id, type, title, body, data, read_at, created_at, updated_at) VALUES (900058469, 31682, 'payment_verified', 'Payment Verified', 'Your Rp 2.000.000 payment for "Arsitek bid" on "Modern Minimalist Villa in Ubud" has been verified.', '{"payment_id": 900012797, "project_id": 14970, "payment_type": "arsitek_bid"}', NULL, '2026-10-30 02:01:33+07', '2026-10-30 02:01:33+07');
INSERT INTO public.notifications (id, user_id, type, title, body, data, read_at, created_at, updated_at) VALUES (900058470, 31694, 'payment_verified', 'Payment Confirmed', 'The Rp 2.000.000 payment for "Arsitek bid" has been confirmed by the payer.', '{"payment_id": 900012797, "project_id": 14970, "payment_type": "arsitek_bid"}', NULL, '2026-10-30 02:01:33+07', '2026-10-30 02:01:33+07');
INSERT INTO public.notifications (id, user_id, type, title, body, data, read_at, created_at, updated_at) VALUES (900122380, 31692, 'dispute_reply', 'New Dispute Message', 'System Admin replied on dispute "Parity admin dispute" (Demo: Two-storey house - design and build open for bids).', '{"dispute_id": 900123010, "project_id": 14976}', NULL, '2026-11-02 13:58:03+07', '2026-11-02 13:58:03+07');
INSERT INTO public.notifications (id, user_id, type, title, body, data, read_at, created_at, updated_at) VALUES (900122383, 31692, 'dispute_resolved', 'Dispute Resolved', 'Dispute "Parity admin dispute" on "Demo: Two-storey house - design and build open for bids" was closed (dismiss). Payments are unfrozen.', '{"dispute_id": 900123010, "project_id": 14976}', NULL, '2026-11-02 13:58:04+07', '2026-11-02 13:58:04+07');
INSERT INTO public.notifications (id, user_id, type, title, body, data, read_at, created_at, updated_at) VALUES (900122386, 31682, 'verification', 'Account Verification Rejected', 'Your request to join as a Arsitek has been rejected. Reason: Parity admin rejection', '{"reason": "Parity admin rejection", "status": "rejected", "professional_type": "arsitek"}', NULL, '2026-11-02 13:58:04+07', '2026-11-02 13:58:04+07');
INSERT INTO public.notifications (id, user_id, type, title, body, data, read_at, created_at, updated_at) VALUES (900122387, 31682, 'verification', 'Account Verification Approved', 'Your request to join as a Arsitek has been approved! You can now access professional features.', '{"reason": null, "status": "verified", "professional_type": "arsitek"}', NULL, '2026-11-02 13:58:04+07', '2026-11-02 13:58:04+07');


--
-- Data for Name: owner_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: p_m_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: personal_access_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: phone_user; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.phone_user (id, contact, id_user, id_contact) VALUES (8973, '+62-800-shadow', 31692, NULL);


--
-- Data for Name: professional_portfolios; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_activity_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.project_activity_logs (id, project_id, user_id, action, details, created_at, updated_at) VALUES (900047949, 14975, 31692, 'requirement_added', 'Added material: Procurement Fixture', '2026-10-30 13:27:45+07', '2026-10-30 13:27:45+07');
INSERT INTO public.project_activity_logs (id, project_id, user_id, action, details, created_at, updated_at) VALUES (900047950, 14975, 31692, 'procurement_requested', 'Requested procurement for Procurement Fixture (1 pcs)', '2026-10-30 13:27:45+07', '2026-10-30 13:27:45+07');
INSERT INTO public.project_activity_logs (id, project_id, user_id, action, details, created_at, updated_at) VALUES (900093490, 14976, 31692, 'specialist_requested', 'Architect requested specialist coordination for: Structural. Description: Parity engineering request', '2026-11-01 19:53:26+07', '2026-11-01 19:53:26+07');
INSERT INTO public.project_activity_logs (id, project_id, user_id, action, details, created_at, updated_at) VALUES (900093491, 14976, 31692, 'engineering_request_verified', 'PM approved specialist request for: Structural', '2026-11-01 19:54:33+07', '2026-11-01 19:54:33+07');
INSERT INTO public.project_activity_logs (id, project_id, user_id, action, details, created_at, updated_at) VALUES (900093492, 14976, 31692, 'specialist_requested', 'Architect requested specialist coordination for: Mep. Description: Parity engineering reject', '2026-11-01 19:54:35+07', '2026-11-01 19:54:35+07');
INSERT INTO public.project_activity_logs (id, project_id, user_id, action, details, created_at, updated_at) VALUES (900093493, 14976, 31692, 'engineering_request_verified', 'PM rejected specialist request for: Mep', '2026-11-01 19:54:35+07', '2026-11-01 19:54:35+07');
INSERT INTO public.project_activity_logs (id, project_id, user_id, action, details, created_at, updated_at) VALUES (900094695, 14976, 31694, 'dispute_resolved', 'Sengketa "Parity admin dispute" ditolak/di-dismiss oleh System Admin. Pembayaran dicabut pembekuannya.', '2026-11-02 13:58:04+07', '2026-11-02 13:58:04+07');


--
-- Data for Name: project_material_folders; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_requirements; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.project_requirements (id, project_id, name, bom_type, quantity_required, estimated_unit_cost, quantity_on_site, quantity_used, quantity_procured_externally, external_cost, unit, quality_level, image_path, notes, purpose, category, created_at, updated_at, user_id, folder_id) VALUES (900019264, 14976, 'Parity Fixture', 'raw', 1.00, NULL, 0.00, 0.00, 0.00, 0.00, 'pcs', 'standard', NULL, 'Pinned by shadow-all gate entries; do not delete.', NULL, 'general', '2026-10-30 12:20:42+07', '2026-10-02 16:20:39+07', 31692, NULL);
INSERT INTO public.project_requirements (id, project_id, name, bom_type, quantity_required, estimated_unit_cost, quantity_on_site, quantity_used, quantity_procured_externally, external_cost, unit, quality_level, image_path, notes, purpose, category, created_at, updated_at, user_id, folder_id) VALUES (900019332, 14975, 'Procurement Fixture', 'raw', 1.00, NULL, 0.00, 0.00, 0.00, 0.00, 'pcs', 'standard', NULL, NULL, NULL, 'general', '2026-10-30 13:27:45+07', '2026-10-30 13:27:45+07', 31692, NULL);


--
-- Data for Name: project_procurement_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.project_procurement_requests (id, project_id, requirement_id, requested_by, quantity_needed, estimated_unit_cost, estimated_cost, message, offer_to_buy, status, pm_note, created_at, updated_at, material_order_id) VALUES (900025060, 14975, 900019332, 31692, 1.00, 0.00, NULL, NULL, false, 'pending_pm', NULL, '2026-10-30 13:27:45+07', '2026-10-30 13:27:45+07', NULL);


--
-- Data for Name: team_members; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_addendums; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.project_addendums (id, project_id, type, role_type, user_id, team_member_id, specialist_type, title, description, negotiation_note, attachment_path, amount, counter_offer_amount, recommended_bid_id, recommended_bid_type, status, payment_proof_path, verification_notes, paid_at, created_at, updated_at, procurement_request_id, assigned_user_id, refunded_amount) VALUES (934, 14975, 'extra_fee', 'notaris', 31685, NULL, NULL, '[Legal Disbursement] Biaya PNBP Hak Atas Tanah', 'Payment for land registration PNBP fees.', NULL, NULL, 5500000.00, NULL, NULL, NULL, 'paid', NULL, NULL, '2026-10-01 17:07:54+07', '2026-10-02 16:20:39+07', '2026-10-02 17:07:54+07', NULL, NULL, 0.00);
INSERT INTO public.project_addendums (id, project_id, type, role_type, user_id, team_member_id, specialist_type, title, description, negotiation_note, attachment_path, amount, counter_offer_amount, recommended_bid_id, recommended_bid_type, status, payment_proof_path, verification_notes, paid_at, created_at, updated_at, procurement_request_id, assigned_user_id, refunded_amount) VALUES (935, 14975, 'extra_fee', 'notaris', 31685, NULL, NULL, '[Legal Disbursement] Biaya Pajak BPHTB (Estimasi)', 'Estimated tax for BPHTB based on deal value.', NULL, NULL, 45000000.00, NULL, NULL, NULL, 'pending_approval', NULL, NULL, NULL, '2026-10-02 16:20:39+07', '2026-10-31 02:52:39+07', NULL, NULL, 0.00);


--
-- Data for Name: project_budget_sandbox; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_budget_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.project_budget_transactions (id, project_id, transaction_type, amount, title, reference_type_id, reference_id, reverses_type_id, reverses_id, transaction_date, actor_user_id, actor_role, voided_at, voided_duplicate_of_id, voided_original_amount, created_at, updated_at, category, type, status, description, reference_model, reverses_model) VALUES (5619, 14975, 'payment', 0.00, '[VOIDED — duplicate ledger reference #5918] [Legal Disbursement] Biaya PNBP Hak Atas Tanah', NULL, NULL, NULL, NULL, '2026-10-01 16:20:39+07', NULL, NULL, '2026-10-20 22:05:57+07', 5918, 5500000.00, '2026-10-02 16:20:39+07', '2026-10-02 16:20:39+07', NULL, NULL, NULL, NULL, 'App\Models\ProjectAddendum', NULL);
INSERT INTO public.project_budget_transactions (id, project_id, transaction_type, amount, title, reference_type_id, reference_id, reverses_type_id, reverses_id, transaction_date, actor_user_id, actor_role, voided_at, voided_duplicate_of_id, voided_original_amount, created_at, updated_at, category, type, status, description, reference_model, reverses_model) VALUES (5918, 14975, 'payment', 5500000.00, '[Legal Disbursement] Biaya PNBP Hak Atas Tanah', NULL, 934, NULL, NULL, '2026-10-01 17:07:54+07', NULL, NULL, NULL, NULL, NULL, '2026-10-02 17:07:54+07', '2026-10-02 17:07:54+07', NULL, NULL, NULL, NULL, 'App\Models\ProjectAddendum', NULL);


--
-- Data for Name: project_milestones; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_change_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_comments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_daily_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_delays; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_documents; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_external_vendors; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_images; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.project_images (id, project_id, image_path, sort_order, created_at, updated_at) VALUES (1, 14970, 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=2070&auto=format&fit=crop', 0, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');
INSERT INTO public.project_images (id, project_id, image_path, sort_order, created_at, updated_at) VALUES (2, 14970, 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=2071&auto=format&fit=crop', 1, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');
INSERT INTO public.project_images (id, project_id, image_path, sort_order, created_at, updated_at) VALUES (3, 14971, 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=2070&auto=format&fit=crop', 0, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');
INSERT INTO public.project_images (id, project_id, image_path, sort_order, created_at, updated_at) VALUES (4, 14972, 'https://images.unsplash.com/photo-1503387762-592dea58ef23?q=80&w=2070&auto=format&fit=crop', 0, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');
INSERT INTO public.project_images (id, project_id, image_path, sort_order, created_at, updated_at) VALUES (5, 14972, 'https://images.unsplash.com/photo-1541888946425-d81bb19480c5?q=80&w=2070&auto=format&fit=crop', 1, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');
INSERT INTO public.project_images (id, project_id, image_path, sort_order, created_at, updated_at) VALUES (6, 14973, 'https://images.unsplash.com/photo-1583847268964-b28dc2f51ac9?q=80&w=1974&auto=format&fit=crop', 0, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');
INSERT INTO public.project_images (id, project_id, image_path, sort_order, created_at, updated_at) VALUES (7, 14973, 'https://images.unsplash.com/photo-1594026112284-02bb6f3352fe?q=80&w=2070&auto=format&fit=crop', 1, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');
INSERT INTO public.project_images (id, project_id, image_path, sort_order, created_at, updated_at) VALUES (8, 14974, 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop', 0, '2026-10-02 16:20:38+07', '2026-10-02 16:20:38+07');


--
-- Data for Name: project_payment_termins; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.project_payment_termins (id, project_id, role_type, recipient_id, label, percentage, amount, retention_amount, retention_released_at, retention_released_amount, net_amount, trigger_description, status, payment_proof_path, verification_notes, milestone_id, change_order_id, paid_at, notes, retention_notes, created_at, updated_at, refunded_amount) VALUES (900021255, 14976, 'arsitek', NULL, 'DP', 50.00, 1000000.00, 50000.00, NULL, NULL, 950000.00, NULL, 'locked', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-30 13:37:35+07', '2026-10-02 16:20:39+07', 0.00);


--
-- Data for Name: project_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_requirement_histories; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.project_requirement_histories (id, project_requirement_id, user_id, type, quantity, notes, created_at, updated_at) VALUES (900020069, 900019264, 31692, 'restock', 0.00, 'Material requirement created', '2026-10-30 12:20:42+07', '2026-10-30 12:20:42+07');
INSERT INTO public.project_requirement_histories (id, project_requirement_id, user_id, type, quantity, notes, created_at, updated_at) VALUES (900020182, 900019332, 31692, 'restock', 0.00, 'Material requirement created', '2026-10-30 13:27:45+07', '2026-10-30 13:27:45+07');


--
-- Data for Name: project_schedules; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_snag_items; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_sub_professionals; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_timeline_extensions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: project_warranty_claims; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: provinces; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.provinces (id, name) VALUES (52, 'Jawa Barat');


--
-- Data for Name: push_subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: rate_limit_hits; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: regions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.regions (id, name, id_province) VALUES (52, 'Bekasi', 52);


--
-- Data for Name: role_has_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.role_has_permissions (permission_id, role_id) VALUES (1, 415);
INSERT INTO public.role_has_permissions (permission_id, role_id) VALUES (2, 415);
INSERT INTO public.role_has_permissions (permission_id, role_id) VALUES (3, 415);
INSERT INTO public.role_has_permissions (permission_id, role_id) VALUES (4, 415);


--
-- Data for Name: rooms; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: rooms_pic; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: saved_searches; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: sticky_notes; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: user_channels; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Name: admin_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.admin_id_seq', 1, false);


--
-- Name: arsitek_ratings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.arsitek_ratings_id_seq', 1, false);


--
-- Name: arsiteks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.arsiteks_id_seq', 6635, false);


--
-- Name: bid_negotiation_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bid_negotiation_logs_id_seq', 1, false);


--
-- Name: bids_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bids_id_seq', 6, false);


--
-- Name: chat_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.chat_messages_id_seq', 1, false);


--
-- Name: contact_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.contact_id_seq', 1, false);


--
-- Name: contractor_subspecialties_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.contractor_subspecialties_id_seq', 11, false);


--
-- Name: conversations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.conversations_id_seq', 1, false);


--
-- Name: courier_profiles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.courier_profiles_id_seq', 2, false);


--
-- Name: delivery_jobs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.delivery_jobs_id_seq', 1, false);


--
-- Name: dispute_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.dispute_messages_id_seq', 1, false);


--
-- Name: favorites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.favorites_id_seq', 1, false);


--
-- Name: firm_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.firm_members_id_seq', 1, false);


--
-- Name: house_answers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.house_answers_id_seq', 1, false);


--
-- Name: house_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.house_id_seq', 1, false);


--
-- Name: house_pic_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.house_pic_id_seq', 1, false);


--
-- Name: house_questions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.house_questions_id_seq', 1, false);


--
-- Name: interior_profiles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.interior_profiles_id_seq', 378, false);


--
-- Name: interior_ratings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.interior_ratings_id_seq', 1, false);


--
-- Name: kontraktor_ratings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.kontraktor_ratings_id_seq', 1, false);


--
-- Name: kontraktor_spesialisasi_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.kontraktor_spesialisasi_id_seq', 1, false);


--
-- Name: kontraktors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.kontraktors_id_seq', 6551, false);


--
-- Name: mail_outbox_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.mail_outbox_id_seq', 1, false);


--
-- Name: material_images_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.material_images_id_seq', 1, false);


--
-- Name: material_order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.material_order_items_id_seq', 1, false);


--
-- Name: material_order_reviews_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.material_order_reviews_id_seq', 1, false);


--
-- Name: material_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.material_orders_id_seq', 1, false);


--
-- Name: material_quotes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.material_quotes_id_seq', 1, false);


--
-- Name: materials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.materials_id_seq', 274, false);


--
-- Name: mep_engineers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.mep_engineers_id_seq', 592, false);


--
-- Name: notaris_consultations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notaris_consultations_id_seq', 1, false);


--
-- Name: notaris_profiles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notaris_profiles_id_seq', 565, false);


--
-- Name: notaris_ratings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notaris_ratings_id_seq', 1, false);


--
-- Name: notaris_services_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notaris_services_id_seq', 4, false);


--
-- Name: notification_preferences_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notification_preferences_id_seq', 1, false);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notifications_id_seq', 900122388, false);


--
-- Name: owner_ratings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.owner_ratings_id_seq', 1, false);


--
-- Name: p_m_ratings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.p_m_ratings_id_seq', 1, false);


--
-- Name: permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.permissions_id_seq', 5, false);


--
-- Name: personal_access_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.personal_access_tokens_id_seq', 215018, false);


--
-- Name: phone_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.phone_user_id_seq', 8974, false);


--
-- Name: professional_portfolios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.professional_portfolios_id_seq', 1, false);


--
-- Name: project_activity_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_activity_logs_id_seq', 900094696, false);


--
-- Name: project_addendums_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_addendums_id_seq', 936, false);


--
-- Name: project_budget_sandbox_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_budget_sandbox_id_seq', 1, false);


--
-- Name: project_budget_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_budget_transactions_id_seq', 5919, false);


--
-- Name: project_change_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_change_orders_id_seq', 1, false);


--
-- Name: project_comments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_comments_id_seq', 1, false);


--
-- Name: project_daily_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_daily_logs_id_seq', 1, false);


--
-- Name: project_delays_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_delays_id_seq', 1, false);


--
-- Name: project_disputes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_disputes_id_seq', 1, false);


--
-- Name: project_documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_documents_id_seq', 1, false);


--
-- Name: project_external_vendors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_external_vendors_id_seq', 1, false);


--
-- Name: project_images_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_images_id_seq', 9, false);


--
-- Name: project_managers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_managers_id_seq', 832, false);


--
-- Name: project_material_folders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_material_folders_id_seq', 1, false);


--
-- Name: project_milestones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_milestones_id_seq', 1, false);


--
-- Name: project_payment_termins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_payment_termins_id_seq', 900021256, false);


--
-- Name: project_procurement_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_procurement_requests_id_seq', 900025061, false);


--
-- Name: project_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_reports_id_seq', 1, false);


--
-- Name: project_requirement_histories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_requirement_histories_id_seq', 900020183, false);


--
-- Name: project_requirements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_requirements_id_seq', 900019333, false);


--
-- Name: project_schedules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_schedules_id_seq', 1, false);


--
-- Name: project_snag_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_snag_items_id_seq', 1, false);


--
-- Name: project_sub_professionals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_sub_professionals_id_seq', 1, false);


--
-- Name: project_terminations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_terminations_id_seq', 1, false);


--
-- Name: project_timeline_extensions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_timeline_extensions_id_seq', 1, false);


--
-- Name: project_warranty_claims_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.project_warranty_claims_id_seq', 1, false);


--
-- Name: projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.projects_id_seq', 14978, false);


--
-- Name: provinces_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.provinces_id_seq', 53, false);


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.push_subscriptions_id_seq', 1, false);


--
-- Name: regions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.regions_id_seq', 53, false);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.roles_id_seq', 428, false);


--
-- Name: rooms_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.rooms_id_seq', 1, false);


--
-- Name: rooms_pic_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.rooms_pic_id_seq', 1, false);


--
-- Name: saved_searches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.saved_searches_id_seq', 1, false);


--
-- Name: spesialisasi_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.spesialisasi_id_seq', 1, false);


--
-- Name: sticky_notes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.sticky_notes_id_seq', 1, false);


--
-- Name: structural_engineers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.structural_engineers_id_seq', 1080, false);


--
-- Name: suppliers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.suppliers_id_seq', 1094, false);


--
-- Name: team_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.team_members_id_seq', 1, false);


--
-- Name: user_channels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_channels_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 31701, false);


--
-- PostgreSQL database dump complete
--



--
-- Demo showcase rows
-- ------------------
-- The historical dump carried projects and professional profiles but no
-- property listings, almost no catalogue, and two accounts whose role_type
-- did not match their profile (a courier and a supplier). These rows make the
-- public marketplace, property detail and supplier screens demonstrable on a
-- fresh database.
--

UPDATE public.users SET role_type = 'logistics' WHERE id = 31686 AND email = 'fariz@example.test';
UPDATE public.users SET role_type = 'supplier' WHERE id = 31687 AND email = 'akmal@example.test';
UPDATE public.suppliers SET store_name = 'Akmal Build & Interior Supply' WHERE id = 1093;

INSERT INTO public.house (id, name, price, house_desc, width, length, br, ba, floors, coordinate, street_name, kelurahan, kecamatan, kab_kota, province, postal_code, views, id_user, created_at, updated_at) VALUES
(1, 'Modern Minimalist Villa in Ubud', 4200000000.00, 'A calm three-bedroom villa with a private garden, natural stone finishes and an open living pavilion. Ten minutes from central Ubud.', '12', '18', 3, 3, 2, '-8.506854, 115.262482', 'Jl. Raya Sanggingan', 'Sanggingan', 'Ubud', 'Gianyar', 'Bali', '80571', 182, 31692, now() - interval '18 days', now() - interval '2 days'),
(2, 'Scandinavian Family Home in Bekasi', 1850000000.00, 'Bright family home with a double-height living room, four bedrooms and a covered carport for two cars. Ready to move in.', '10', '15', 4, 3, 2, '-6.238270, 106.975573', 'Jl. Boulevard Hijau', 'Jaka Setia', 'Bekasi Selatan', 'Bekasi', 'Jawa Barat', '17147', 96, 31693, now() - interval '14 days', now() - interval '1 day'),
(3, 'Tropical Courtyard House in Canggu', 5600000000.00, 'Indoor-outdoor living around a planted courtyard. Three suites, a media room and a rooftop terrace for sunset views.', '14', '20', 4, 4, 2, '-8.647817, 115.138474', 'Jl. Pantai Pererenan', 'Pererenan', 'Mengwi', 'Badung', 'Bali', '80351', 241, 31692, now() - interval '9 days', now() - interval '4 hours'),
(4, 'Renovated Townhouse in South Jakarta', 2950000000.00, 'A 1990s townhouse reopened into a light-filled home with a new kitchen, service area and a small plunge pool.', '8', '14', 3, 2, 2, '-6.260721, 106.810463', 'Jl. Senopati Dalam', 'Gunung', 'Kebayoran Baru', 'Jakarta Selatan', 'DKI Jakarta', '12120', 73, 31693, now() - interval '6 days', now() - interval '12 hours'),
(5, 'Compact Smart Home in BSD', 1250000000.00, 'Two-bedroom smart home with solar-ready wiring, a rainwater tank and a low-maintenance garden. Ideal first home.', '7', '12', 2, 2, 1, '-6.301927, 106.653174', 'Jl. Nusa Loka', 'Nusa Loka', 'Serpong', 'Tangerang Selatan', 'Banten', '15318', 58, 31692, now() - interval '4 days', now() - interval '6 hours'),
(6, 'Warehouse-Loft Conversion in Bandung', 3850000000.00, 'An industrial loft with exposed brick, steel windows and a mezzanine studio. Suitable for a live-work arrangement.', '11', '22', 3, 3, 2, '-6.917464, 107.619123', 'Jl. Cigondewah Kaler', 'Cigondewah', 'Bandung Kulon', 'Bandung', 'Jawa Barat', '40214', 131, 31693, now() - interval '2 days', now() - interval '30 minutes');

INSERT INTO public.house_pic (id, file_name, dir, size, id_house, created_at, updated_at) VALUES
(1, 'cover.jpg', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80', '1200x800', 1, now(), now()),
(2, 'cover.jpg', 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80', '1200x800', 2, now(), now()),
(3, 'cover.jpg', 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=80', '1200x800', 3, now(), now()),
(4, 'cover.jpg', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80', '1200x800', 4, now(), now()),
(5, 'cover.jpg', 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80', '1200x800', 5, now(), now()),
(6, 'cover.jpg', 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=80', '1200x800', 6, now(), now());

INSERT INTO public.rooms (id, name, type, width, length, "desc", id_house, created_at, updated_at) VALUES
(1, 'Living pavilion', 'Living', '6', '8', 'Open to the garden with sliding glass walls.', 1, now(), now()),
(2, 'Master suite', 'Bedroom', '5', '5', 'Garden view with a walk-in wardrobe.', 1, now(), now()),
(3, 'Family living', 'Living', '5', '6', 'Double-height space with a reading nook.', 2, now(), now()),
(4, 'Kitchen', 'Kitchen', '3', '4', 'Island bench and a full-height pantry.', 2, now(), now()),
(5, 'Courtyard lounge', 'Living', '6', '6', 'Opens to the planted courtyard.', 3, now(), now()),
(6, 'Rooftop terrace', 'Outdoor', '8', '5', 'Sunset-facing with a pergola.', 3, now(), now()),
(7, 'Dining room', 'Dining', '4', '5', 'Seats ten beside the plunge pool.', 4, now(), now()),
(8, 'Study', 'Study', '3', '3', 'Built-in desk and shelving.', 4, now(), now()),
(9, 'Living room', 'Living', '4', '6', 'Smart lighting and a compact work corner.', 5, now(), now()),
(10, 'Mezzanine studio', 'Studio', '6', '6', 'Steel windows and a skylight.', 6, now(), now());

INSERT INTO public.rooms_pic (id, file_name, dir, size, id_room, created_at, updated_at) VALUES
(1, 'living.jpg', 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80', '1200x800', 1, now(), now()),
(2, 'bedroom.jpg', 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1200&q=80', '1200x800', 2, now(), now()),
(3, 'kitchen.jpg', 'https://images.unsplash.com/photo-1600489000022-c2086d79f9d4?auto=format&fit=crop&w=1200&q=80', '1200x800', 4, now(), now());

INSERT INTO public.materials (id, supplier_id, name, description, price, unit, category, stock, is_available, image_path, specifications, created_at, updated_at) VALUES
(274, 1093, 'Portland Cement 50 kg', 'General-purpose OPC cement for structural and finishing work.', 68000.00, 'sak', 'Semen', 420, true, 'https://images.unsplash.com/photo-1517646287270-a5a9ca602e5c?auto=format&fit=crop&w=900&q=80', '{"brand":"Semen Nusantara","weight":"50 kg"}', now(), now()),
(275, 1093, 'Deformed Steel Bar D13', 'Hot-rolled deformed bar for columns, beams and slabs.', 112000.00, 'batang', 'Besi & Baja', 260, true, 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=900&q=80', '{"diameter":"13 mm","length":"12 m"}', now(), now()),
(276, 1093, 'AAC Block 7.5 cm', 'Lightweight autoclaved aerated concrete block for interior walls.', 8500.00, 'pcs', 'Bata & Blok', 1800, true, 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=900&q=80', '{"size":"60 x 20 x 7.5 cm"}', now(), now()),
(277, 1093, 'Washed River Sand', 'Clean washed sand for concrete and mortar mixes.', 285000.00, 'm3', 'Pasir & Agregat', 90, true, 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=80', '{"grade":"medium"}', now(), now()),
(278, 1093, 'Interior Emulsion Paint 5 L', 'Low-odour washable emulsion for interior walls and ceilings.', 235000.00, 'kaleng', 'Cat', 140, true, 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=900&q=80', '{"finish":"matte","coverage":"35 m2"}', now(), now()),
(279, 1093, 'Porcelain Floor Tile 60 x 60', 'Rectified porcelain tile with a soft stone texture.', 95000.00, 'dus', 'Keramik', 320, true, 'https://images.unsplash.com/photo-1615874694520-474822394e73?auto=format&fit=crop&w=900&q=80', '{"coverage":"1.44 m2 per box"}', now(), now()),
(280, 1093, 'Clay Roof Tile', 'Pressed clay tile for pitched roofs, compatible with standard battens.', 4200.00, 'pcs', 'Atap', 2400, true, 'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=900&q=80', '{"profile":"flat interlocking"}', now(), now()),
(281, 1093, 'Marine Plywood 12 mm', 'Moisture-resistant plywood for joinery and wet areas.', 310000.00, 'lembar', 'Kayu', 75, true, 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=900&q=80', '{"size":"122 x 244 cm"}', now(), now()),
(282, 1093, 'PVC Pipe 3 inch', 'Rigid PVC drainage pipe with solvent-weld joints.', 78000.00, 'batang', 'Plumbing', 160, true, 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=900&q=80', '{"length":"4 m"}', now(), now()),
(283, 1093, 'Smart Light Switch', 'Single-gang smart switch with a neutral wire requirement.', 189000.00, 'unit', 'Listrik', 55, true, 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=900&q=80', '{"protocol":"Wi-Fi","color":"white"}', now(), now());

SELECT setval(pg_get_serial_sequence('public.house', 'id'), 6, true);
SELECT setval(pg_get_serial_sequence('public.house_pic', 'id'), 6, true);
SELECT setval(pg_get_serial_sequence('public.rooms', 'id'), 10, true);
SELECT setval(pg_get_serial_sequence('public.rooms_pic', 'id'), 3, true);
SELECT setval(pg_get_serial_sequence('public.materials', 'id'), 283, true);

-- Session tokens are credentials, never seed data. A fresh demo gets none.
DELETE FROM public.personal_access_tokens;

-- Keep every demo account on the password the README names.
UPDATE public.users
   SET password = '$2y$12$bpJVoGaebq5mSG5WURUj2e/uKzgOfs64HP3RbnxSAw4zkOVaZQcES'
 WHERE id BETWEEN 31695 AND 31700;
