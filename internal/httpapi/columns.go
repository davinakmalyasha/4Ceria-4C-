package httpapi

// Explicit column lists (no `SELECT *`).
//
// Each list is the table's columns in `information_schema` order — the same
// rows `SELECT *` returned, byte-identical wire output, but schema-change
// safe (a new column cannot shift positional scanners) and self-documenting
// for what each read actually needs.

const (
	bidsColumns = `id,project_id,role,bidder_user_id,bidder_profile_id,arsitek_id,kontraktor_id,notaris_id,interior_id,pm_id,structural_id,mep_id,price,price_max,negotiation_count,fee_type,unit_price,quantity,calculated_total,proposal,status,is_recommended,estimated_duration,duration_unit,attachment_1,attachment_2,attachment_3,payment_status,paid_at,scopes,deliverables,created_at,updated_at,offered_by_id,fee_agreed_at,payment_proof_path,verification_notes,proposed_termins,proposed_milestones,refunded_amount,proposed_team,style,construction_method,cost_breakdown,workforce_count,equipment_owned,warranty_months,payment_preference,tax_estimate,fee_percentage,selected_services,license_number,experience_years,technical_notes,interview_notes,legacy_id`

	projectsRowColumns = `id,user_id,title,description,budget,lokasi,jenis_proyek,owner_id,selected_arsitek_id,selected_kontraktor_id,selected_notaris_id,selected_interior_id,pm_id,structural_id,mep_id,structural_approved_at,mep_approved_at,status,published_bidding_roles,bidding_choices,target_role,needed_phases,completed_phases,wants_project_manager,requires_structural,requires_mep,requires_interior,latitude,longitude,province,city,kecamatan,kelurahan,postal_code,street_name,design_details,design_completed_at,design_authorized_at,materials_authorized_at,design_locked_at,legal_completed_at,pbg_verified_at,slf_verified_at,legal_locked_at,construction_details,construction_completed_at,construction_authorized_at,construction_locked_at,construction_brief_status,construction_brief_revision_notes,interior_details,interior_locked_at,interior_completed_at,planning_status,negotiated_fee,payment_instructions,planning_submitted_at,planning_approved_at,design_payment_verified_at,construction_payment_verified_at,interior_payment_verified_at,arsitek_kickoff_at,kontraktor_kickoff_at,pm_audit_notes,pm_audit_attachments,architect_notes,planning_iteration,project_category,project_dimensions,legal_detail,wants_to_discuss_later,legal_requirements,share_token,attachment,deadline,created_at,updated_at,design_handover_submitted_at,construction_handover_submitted_at,interior_handover_submitted_at,design_handover_notes,construction_handover_notes,interior_handover_notes,legal_handover_submitted_at,legal_handover_notes,final_walkthrough_at,walkthrough_status,completed_at,owner_accepted_at,owner_acceptance_notes,owner_design_approved_at,owner_build_approved_at,owner_interior_approved_at,owner_legal_approved_at,warranty_start_at,warranty_end_at,deleted_at,planning_pm_verified_at`

	usersRowColumns = `id,name,email,username,unique_code,email_verified_at,pic,firm_name,firm_slogan,firm_banner_path,firm_description,firm_is_hiring,firm_needed_roles,"Deskripsi",bank_name,bank_account_number,bank_account_name,created_at,updated_at,role_type,is_suspended`

	teamMembersColumns = `id,owner_user_id,owner_role,name,photo_path,role_title,bio,skills,phone,email,status,created_at,updated_at`

	milestonesColumns = `id,project_id,arsitek_id,kontraktor_id,notaris_id,interior_id,pm_id,structural_id,mep_id,title,type,content,description,review_note,review_status,image,sort_order,start_date,due_date,is_completed,approval_status,revision_notes,phase_context,lead_pro_verified_at,pm_verified_at,progress_attachment,created_at,updated_at`

	requirementsColumns = `id,project_id,name,bom_type,quantity_required,estimated_unit_cost,quantity_on_site,quantity_used,quantity_procured_externally,external_cost,unit,quality_level,image_path,notes,purpose,category,created_at,updated_at,user_id,folder_id`

	requirementHistoriesColumns = `id,project_requirement_id,user_id,type,quantity,notes,created_at,updated_at`

	procurementColumns = `id,project_id,requirement_id,requested_by,quantity_needed,estimated_unit_cost,estimated_cost,message,offer_to_buy,status,pm_note,created_at,updated_at`

	terminsColumns = `id,project_id,role_type,recipient_id,label,percentage,amount,retention_amount,retention_released_at,retention_released_amount,net_amount,trigger_description,status,payment_proof_path,verification_notes,milestone_id,change_order_id,paid_at,notes,retention_notes,created_at,updated_at,refunded_amount`

	addendumsColumns = `id,project_id,type,role_type,user_id,team_member_id,specialist_type,title,description,negotiation_note,attachment_path,amount,counter_offer_amount,recommended_bid_id,recommended_bid_type,status,payment_proof_path,verification_notes,paid_at,created_at,updated_at,procurement_request_id,assigned_user_id,refunded_amount`

	materialOrdersColumns = `id,user_id,supplier_id,project_id,status,verification_notes,total_price,shipping_cost,whatsapp_order_id,payment_proof_path,notes,paid_at,shipped_at,delivered_at,completed_at,created_at,updated_at,refunded_amount,delivery_method,ready_for_pickup_at,latitude,longitude,delivery_address,address_detail,delivery_documentation_path,is_stock_decremented,total_weight`
)

// profileRowColumns reuses directoryColumns for the seven profile tables.
func profileRowColumns(table string) string {
	if cols := directoryColumns(table); cols != "*" {
		return cols
	}
	return `id`
}

// ratingsRowColumns builds the explicit list for a ratings table with the
// given profile FK (e.g. arsitek_id for arsitek_ratings).
func ratingsRowColumns(fk string) string {
	return `id,project_id,reviewer_id,` + fk + `,rating,komentar,created_at,updated_at`
}
