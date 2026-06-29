<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectResource extends JsonResource
{
    private static $resolvedProfiles = null;

    public function toArray(Request $request): array
    {
        $user = auth('sanctum')->user();

        // Guard against static cache persisting across PHP-FPM requests for different users
        if ($user && (static::$resolvedProfiles === null || (static::$resolvedProfiles['_user_id'] ?? null) !== $user->id)) {
            $user->loadMissing([
                'arsitek',
                'kontraktor',
                'notaris_profile',
                'interior_profile',
                'structural_engineer',
                'mep_engineer',
                'project_manager'
            ]);

            static::$resolvedProfiles = [
                '_user_id' => $user->id,
                'arsitek_id' => $user->arsitek?->id,
                'kontraktor_id' => $user->kontraktor?->id,
                'notaris_id' => $user->notaris_profile?->id,
                'interior_id' => $user->interior_profile?->id,
                'structural_id' => $user->structural_engineer?->id,
                'mep_id' => $user->mep_engineer?->id,
                'pm_id' => $user->project_manager?->id,
            ];
        }

        $userArsitekId = static::$resolvedProfiles['arsitek_id'] ?? null;
        $userKontraktorId = static::$resolvedProfiles['kontraktor_id'] ?? null;
        $userNotarisId = static::$resolvedProfiles['notaris_id'] ?? null;
        $userInteriorId = static::$resolvedProfiles['interior_id'] ?? null;
        $userStructuralId = static::$resolvedProfiles['structural_id'] ?? null;
        $userMepId = static::$resolvedProfiles['mep_id'] ?? null;
        $userPmId = static::$resolvedProfiles['pm_id'] ?? null;

        $hasSubmittedBid = false;

        if ($user) {
            $role = $user->role_type;

            // Standard Profiles
            // NOTE: Always filter by the user's profile ID even when the relation is loaded,
            // because the relation may have been eager-loaded without the user-scoped filter
            // (e.g. when with_bids=true loads all bids for the project owner view).
            if ($role === 'arsitek' && $userArsitekId) {
                $hasSubmittedBid = $this->relationLoaded('bidsArsitek')
                    ? $this->bidsArsitek->where('arsitek_id', $userArsitekId)->where('status', '!=', 'invited')->isNotEmpty()
                    : $this->bidsArsitek()->where('arsitek_id', $userArsitekId)->where('status', '!=', 'invited')->exists();
            } elseif ($role === 'kontraktor' && $userKontraktorId) {
                $hasSubmittedBid = $this->relationLoaded('bidsKontraktor')
                    ? $this->bidsKontraktor->where('kontraktor_id', $userKontraktorId)->where('status', '!=', 'invited')->isNotEmpty()
                    : $this->bidsKontraktor()->where('kontraktor_id', $userKontraktorId)->where('status', '!=', 'invited')->exists();
            } elseif ($role === 'notaris' && $userNotarisId) {
                $hasSubmittedBid = $this->relationLoaded('bidsNotaris')
                    ? $this->bidsNotaris->where('notaris_id', $userNotarisId)->where('status', '!=', 'invited')->isNotEmpty()
                    : $this->bidsNotaris()->where('notaris_id', $userNotarisId)->where('status', '!=', 'invited')->exists();
            } elseif ($role === 'interior' && $userInteriorId) {
                $hasSubmittedBid = $this->relationLoaded('bidsInterior')
                    ? $this->bidsInterior->where('interior_id', $userInteriorId)->where('status', '!=', 'invited')->isNotEmpty()
                    : $this->bidsInterior()->where('interior_id', $userInteriorId)->where('status', '!=', 'invited')->exists();
            }
            // Enterprise Profiles (PM, Structural, MEP)
            elseif ($role === 'project_manager') {
                if ($userPmId) {
                    $hasSubmittedBid = $this->relationLoaded('bidsProjectManager')
                        ? $this->bidsProjectManager->where('pm_id', $userPmId)->where('status', '!=', 'invited')->isNotEmpty()
                        : $this->bidsProjectManager()->where('pm_id', $userPmId)->where('status', '!=', 'invited')->exists();
                }
            } elseif ($role === 'structural') {
                if ($userStructuralId) {
                    $hasSubmittedBid = $this->relationLoaded('bidsStructural')
                        ? $this->bidsStructural->where('structural_id', $userStructuralId)->where('status', '!=', 'invited')->isNotEmpty()
                        : $this->bidsStructural()->where('structural_id', $userStructuralId)->where('status', '!=', 'invited')->exists();
                }
            } elseif ($role === 'mep') {
                if ($userMepId) {
                    $hasSubmittedBid = $this->relationLoaded('bidsMep')
                        ? $this->bidsMep->where('mep_id', $userMepId)->where('status', '!=', 'invited')->isNotEmpty()
                        : $this->bidsMep()->where('mep_id', $userMepId)->where('status', '!=', 'invited')->exists();
                }
            }
        }

        $canViewPhone = false;
        if ($user) {
            if ($user->id === $this->user_id) {
                $canViewPhone = true;
            } elseif ($this->pm_id && $user->id === $this->pm_id) {
                $canViewPhone = true;
            } elseif ($this->selected_arsitek_id && $userArsitekId === $this->selected_arsitek_id) {
                $canViewPhone = true;
            } elseif ($this->selected_kontraktor_id && $userKontraktorId === $this->selected_kontraktor_id) {
                $canViewPhone = true;
            } elseif ($this->selected_notaris_id && $userNotarisId === $this->selected_notaris_id) {
                $canViewPhone = true;
            } elseif ($this->selected_interior_id && $userInteriorId === $this->selected_interior_id) {
                $canViewPhone = true;
            } elseif ($this->structural_id && $userStructuralId === $this->structural_id) {
                $canViewPhone = true;
            } elseif ($this->mep_id && $userMepId === $this->mep_id) {
                $canViewPhone = true;
            } elseif ($this->relationLoaded('subProfessionals')
                ? $this->subProfessionals->where('user_id', $user->id)->where('status', 'active')->isNotEmpty()
                : $this->subProfessionals()->where('user_id', $user->id)->where('status', 'active')->exists()) {
                $canViewPhone = true;
            }
        }

        return [
            'id' => $this->id,
            'has_submitted_bid' => $hasSubmittedBid,
            'title' => $this->title,
            'description' => $this->description,
            'budget' => $this->budget,
            'location' => $this->lokasi,
            'latitude' => $canViewPhone ? $this->latitude : null,
            'longitude' => $canViewPhone ? $this->longitude : null,
            'province' => $this->province,
            'city' => $this->city,
            'kecamatan' => $this->kecamatan,
            'kelurahan' => $canViewPhone ? $this->kelurahan : null,
            'postal_code' => $canViewPhone ? $this->postal_code : null,
            'street_name' => $canViewPhone ? $this->street_name : null,
            'type' => $this->jenis_proyek,
            'target_role' => $this->target_role,
            'status' => $this->status,
            'project_category' => $this->project_category,
            'deadline' => $this->deadline,
            'attachment' => $this->attachment,
            'owner_id' => $this->user_id,
            'user_id' => $this->user_id,
            'owner' => $this->user ? [
                'id' => $this->user->id,
                'name' => $this->user->name,
                'phone' => $canViewPhone ? ($this->user->phone_number ?? $this->user->phone ?? ($this->user->relationLoaded('phoneNumber') ? $this->user->phoneNumber->first()?->contact : null)) : null,
            ] : null,
            'selected_arsitek_id' => $this->selected_arsitek_id,
            'selected_kontraktor_id' => $this->selected_kontraktor_id,
            'selected_notaris_id' => $this->selected_notaris_id,
            'selected_interior_id' => $this->selected_interior_id,
            'completed_phases' => $this->completed_phases ?? [],
            'needed_phases' => $this->needed_phases ?? [],
            'design_completed_at' => $this->design_completed_at,
            'design_locked_at' => $this->design_locked_at,
            'design_authorized_at' => $this->design_authorized_at,
            'design_details' => $this->resolveDesignDetailsUrls($this->design_details),
            'legal_requirements' => $this->legal_requirements ?? [],
            'construction_completed_at' => $this->construction_completed_at,
            'construction_locked_at' => $this->construction_locked_at,
            'construction_authorized_at' => $this->construction_authorized_at,
            'materials_authorized_at' => $this->materials_authorized_at,
            'interior_completed_at' => $this->interior_completed_at,
            'interior_locked_at' => $this->interior_locked_at,
            'legal_locked_at' => $this->legal_locked_at,
            'construction_details' => $this->construction_details,
            'interior_details' => $this->interior_details,
            'design_handover_submitted_at' => $this->design_handover_submitted_at,
            'design_handover_notes' => $this->design_handover_notes,
            'construction_handover_submitted_at' => $this->construction_handover_submitted_at,
            'construction_handover_notes' => $this->construction_handover_notes,
            'interior_handover_submitted_at' => $this->interior_handover_submitted_at,
            'interior_handover_notes' => $this->interior_handover_notes,
            'legal_handover_submitted_at' => $this->legal_handover_submitted_at,
            'legal_handover_notes' => $this->legal_handover_notes,
            'construction_brief_status' => $this->construction_brief_status,
            'construction_brief_revision_notes' => $this->construction_brief_revision_notes,
            'pbg_verified_at' => $this->pbg_verified_at,
            'slf_verified_at' => $this->slf_verified_at,
            'final_walkthrough_at' => $this->final_walkthrough_at,
            'owner_accepted_at' => $this->owner_accepted_at,
            'owner_acceptance_notes' => $this->owner_acceptance_notes,
            'owner_design_approved_at' => $this->owner_design_approved_at,
            'owner_build_approved_at' => $this->owner_build_approved_at,
            'owner_interior_approved_at' => $this->owner_interior_approved_at,
            'owner_legal_approved_at' => $this->owner_legal_approved_at,
            'warranty_start_at' => $this->warranty_start_at,
            'warranty_end_at' => $this->warranty_end_at,
            'retention_balance' => $this->relationLoaded('paymentTermins')
                ? (float) $this->paymentTermins->where('role_type', 'kontraktor')->sum('retention_amount')
                : 0.0,
            'snag_counts' => [
                'open' => $this->relationLoaded('snagItems') ? $this->snagItems->where('status', 'open')->count() : 0,
                'in_progress' => $this->relationLoaded('snagItems') ? $this->snagItems->where('status', 'in_progress')->count() : 0,
                'resolved' => $this->relationLoaded('snagItems') ? $this->snagItems->where('status', 'resolved')->count() : 0,
                'accepted' => $this->relationLoaded('snagItems') ? $this->snagItems->where('status', 'accepted')->count() : 0,
            ],
            'warranty_claims' => $this->whenLoaded('warrantyClaims', function() {
                return $this->warrantyClaims->map(fn($c) => [
                    'id' => $c->id,
                    'title' => $c->title,
                    'description' => $c->description,
                    'status' => $c->status,
                    'cost_impact' => (float) $c->cost_impact,
                    'resolved_at' => $c->resolved_at,
                    'created_at' => $c->created_at,
                    'reporter' => $c->reporter ? ['id' => $c->reporter->id, 'name' => $c->reporter->name] : null,
                ]);
            }),
            'extensions' => $this->whenLoaded('timelineExtensions', function() {
                return $this->timelineExtensions->map(fn($e) => [
                    'id' => $e->id,
                    'reason' => $e->reason,
                    'days_requested' => $e->days_requested,
                    'status' => $e->status,
                    'new_deadline_date' => $e->new_deadline_date,
                    'requester_name' => $e->requester?->name,
                ]);
            }),
            'change_order_summary' => [
                'total_cost_impact' => $this->relationLoaded('changeOrders')
                    ? (float) $this->changeOrders->where('status', 'owner_approved')->sum('cost_impact')
                    : 0.0,
                'pending_count' => $this->relationLoaded('changeOrders')
                    ? $this->changeOrders->whereNotIn('status', ['rejected', 'implemented'])->count()
                    : 0,
            ],
            'budget_summary' => ($request->route('project') || $request->routeIs('*.show'))
                ? $this->calculateBudgetSummary()
                : [
                    'total' => (float) $this->budget,
                    'allocated' => 0.0,
                    'remaining' => (float) $this->budget,
                    'percent_used' => 0.0
                ],
            'client_history' => $this->when(
                array_key_exists('client_history', $this->resource->getAttributes()),
                fn() => $this->client_history
            ),
            'wants_project_manager' => (bool) $this->wants_project_manager,
            'requires_structural' => $this->requires_structural,
            'requires_mep' => $this->requires_mep,
            'project_dimensions' => is_string($this->project_dimensions) ? json_decode($this->project_dimensions, true) : $this->project_dimensions,
            'requires_interior' => $this->requires_interior,
            'planning_status' => $this->planning_status,
            'negotiated_fee' => $this->negotiated_fee,
            'payment_instructions' => $this->payment_instructions,
            'planning_submitted_at' => $this->planning_submitted_at,
            'planning_approved_at' => $this->planning_approved_at,
            'design_payment_verified_at' => $this->design_payment_verified_at,
            'design_locked_at' => $this->design_locked_at,
            'pm_id' => $this->pm_id,
            'pm_audit_notes' => $this->pm_audit_notes,
            'pm_audit_attachments' => collect($this->pm_audit_attachments ?? [])->map(fn($path) => $this->resolveStorageUrl($path))->toArray(),
            'architect_notes' => $this->architect_notes,
            'planning_iteration' => (int) ($this->planning_iteration ?? 0),
            'structural_id' => $this->structural_id,
            'mep_id' => $this->mep_id,
            'is_structural_hired_4c' => (bool) $this->structural_id,
            'is_mep_hired_4c' => (bool) $this->mep_id,
            'structural_profile' => $request->routeIs('*.show') ? $this->resolveSpecialistProfile('structural') : null,
            'mep_profile' => $request->routeIs('*.show') ? $this->resolveSpecialistProfile('mep') : null,
            'interior_profile' => $request->routeIs('*.show') ? $this->resolveSpecialistProfile('interior') : null,
            'structural_engineer' => $this->whenLoaded('structuralEngineer'),
            'mep_engineer' => $this->whenLoaded('mepEngineer'),
            'interior_engineer' => $this->whenLoaded('interior'),
            'structural_approved_at' => $this->structural_approved_at,
            'mep_approved_at' => $this->mep_approved_at,
            'interior_approved_at' => $this->owner_interior_approved_at,
            'share_token' => $this->share_token,
            'legal_detail' => $this->legal_detail,
            'wants_to_discuss_later' => (bool) $this->wants_to_discuss_later,
            'published_bidding_roles' => $this->published_bidding_roles ?? [],
            'bidding_choices' => $this->bidding_choices ?? [],
            'documents' => $this->whenLoaded('documents', function () {
                return $this->documents->map(fn ($doc) => [
                    'id' => $doc->id,
                    'file_name' => $doc->file_name,
                    'file_path' => $this->resolveStorageUrl($doc->file_path),
                    'file_type' => $doc->file_type,
                    'category' => $doc->category,
                    'status' => $doc->status,
                    'target_role' => $doc->target_role,
                    'version_label' => $doc->version_label,
                    'review_note' => $doc->review_note,
                    'reviewed_at' => $doc->reviewed_at,
                    'uploader' => $doc->uploader ? [
                        'id' => $doc->uploader->id,
                        'name' => $doc->uploader->name,
                        'role_type' => $doc->uploader->role_type,
                    ] : null,
                    'created_at' => $doc->created_at,
                ]);
            }),
            'external_vendors' => $this->whenLoaded('externalVendors', function () {
                return $this->externalVendors->map(fn($v) => [
                    'id' => $v->id,
                    'phase_role' => $v->phase_role,
                    'company_name' => $v->company_name,
                    'contact_person' => $v->contact_person,
                    'phone_number' => $v->phone_number,
                    'email' => $v->email,
                    'agreed_fee' => $v->agreed_fee,
                ]);
            }),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'bids_arsitek_count' => $this->bids_arsitek_count ?? 0,
            'bids_kontraktor_count' => $this->bids_kontraktor_count ?? 0,
            'bids_notaris_count' => $this->bids_notaris_count ?? 0,
            'bids_interior_count' => $this->bids_interior_count ?? 0,
            'bids_project_manager_count' => $this->bids_project_manager_count ?? 0,
            'bids_structural_count' => $this->bids_structural_count ?? 0,
            'bids_mep_count' => $this->bids_mep_count ?? 0,
            'addendums' => $this->whenLoaded('addendums', function () {
                return $this->addendums->map(fn ($a) => [
                    'id' => $a->id,
                    'role_type' => $a->role_type,
                    'user_id' => $a->user_id,
                    'assigned_user_id' => $a->assigned_user_id,
                    'team_member_id' => $a->team_member_id,
                    'title' => $a->title,
                    'description' => $a->description,
                    'amount' => (string) $a->amount,
                    'counter_offer_amount' => $a->counter_offer_amount ? (string) $a->counter_offer_amount : null,
                    'negotiation_note' => $a->negotiation_note,
                    'type' => $a->type,
                    'specialist_type' => $a->specialist_type,
                    'teamMember' => $a->teamMember ? [
                        'id' => $a->teamMember->id,
                        'name' => $a->teamMember->name,
                        'bio' => $a->teamMember->bio,
                        'technical_skills' => $a->teamMember->technical_skills,
                        'is_verified' => (bool)$a->teamMember->is_verified,
                        'phone_number' => $a->teamMember->phone_number,
                        'email' => $a->teamMember->email,
                    ] : null,
                    'assignedUser' => $a->assignedUser ? [
                        'id' => $a->assignedUser->id,
                        'name' => $a->assignedUser->name,
                        'email' => $a->assignedUser->email,
                        'phone_number' => $a->assignedUser->phoneNumber->first()?->contact ?? '',
                        'profile_picture' => $this->resolveStorageUrl($a->assignedUser->profile_picture),
                        'technical_skills' => $a->assignedUser->technical_skills,
                    ] : null,
                    'status' => $a->status,
                    'paid_at' => $a->paid_at,
                    'verification_notes' => $a->verification_notes,
                    'payment_proof_path' => $this->resolveStorageUrl($a->payment_proof_path),
                    'created_at' => $a->created_at,
                ]);
            }),
            'comments' => $this->whenLoaded('comments', function () {
                return $this->comments->map(fn ($c) => [
                    'id' => $c->id,
                    'user_id' => $c->user_id,
                    'project_id' => $c->project_id,
                    'message' => $c->message,
                    'content' => $c->message, // Keep both content and message for frontend safety!
                    'parent_id' => $c->parent_id,
                    'user' => $c->user ? [
                        'id' => $c->user->id,
                        'name' => $c->user->name,
                        'profile_picture' => $this->resolveStorageUrl($c->user->profile_picture),
                    ] : null,
                    'created_at' => $c->created_at,
                    'updated_at' => $c->updated_at,
                ]);
            }),
            'images' => $this->whenLoaded('images', function () {
                return $this->images->map(fn ($img) => [
                    'id' => $img->id,
                    'url' => $this->resolveStorageUrl($img->image_path),
                    'sort_order' => $img->sort_order,
                ]);
            }),
            'bids_arsitek' => $this->whenLoaded('bidsArsitek', function () {
                return $this->bidsArsitek->map(function ($bid) {
                    return [
                        'id' => $bid->id,
                        'price' => $bid->price,
                        'price_max' => $bid->price_max,
                        'calculated_total' => $bid->calculated_total,
                        'fee_type' => $bid->fee_type,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'scopes' => $bid->scopes,
                        'deliverables' => $bid->deliverables,
                        'attachments' => array_filter([
                            $this->resolveStorageUrl($bid->attachment_1),
                            $this->resolveStorageUrl($bid->attachment_2),
                            $this->resolveStorageUrl($bid->attachment_3),
                        ]),
                        'created_at' => $bid->created_at,
                        'offered_by_id' => $bid->offered_by_id,
                        'negotiation_count' => (int) ($bid->negotiation_count ?? 0),
                        'fee_agreed_at' => $bid->fee_agreed_at,
                        'payment_status' => $bid->payment_status,
                        'payment_proof_path' => $this->resolveStorageUrl($bid->payment_proof_path),
                        'verification_notes' => $bid->verification_notes,
                        'proposed_termins' => $bid->proposed_termins,
                        'proposed_milestones' => $bid->proposed_milestones,
                        'proposed_team' => $bid->proposed_team,
                        'pro_signature_url' => $this->resolveSignatureUrl('arsitek', $bid),
                        'client_signature_url' => $this->resolveSignatureUrl('arsitek', $bid, true),
                        'is_recommended' => (bool) $bid->is_recommended,
                        'negotiation_logs' => $bid->relationLoaded('negotiationLogs') ? $bid->negotiationLogs->map(fn($log) => [
                            'user_name' => $log->user->name,
                            'round_number' => $log->round_number,
                            'note' => $log->note,
                            'changes' => $log->changes_detected,
                            'created_at' => $log->created_at,
                        ]) : [],
                        'bidder' => $bid->relationLoaded('arsitek') && $bid->arsitek ? [
                            'id' => $bid->arsitek->id,
                            'name' => $bid->arsitek->nama ?? $bid->arsitek->user->name,
                            'phone' => $bid->arsitek->no_telp ?? $bid->arsitek->user->phoneNumber->first()?->contact,
                            'spesialisasi' => $bid->arsitek->spesialisasi,
                            'specialization' => $bid->arsitek->spesialisasi,
                            'experience_years' => $bid->arsitek->pengalaman_tahun,
                            'pengalaman_tahun' => $bid->arsitek->pengalaman_tahun,
                            'rate' => $bid->arsitek->rate_harga,
                            'rate_harga' => $bid->arsitek->rate_harga,
                            'location' => $bid->arsitek->lokasi,
                            'lokasi' => $bid->arsitek->lokasi,
                            'average_rating' => $bid->arsitek->average_rating,
                            'review_count' => $bid->arsitek->review_count,
                            'foto' => $this->resolveStorageUrl($bid->arsitek->foto),
                            'deskripsi' => $bid->arsitek->deskripsi,
                            'pendidikan' => $bid->arsitek->pendidikan,
                            'file_portofolio' => $this->resolveStorageUrl($bid->arsitek->file_portofolio),
                            'file_sertifikat' => $this->resolveStorageUrl($bid->arsitek->file_sertifikat),
                            'user' => [
                                'id' => $bid->arsitek->user->id,
                                'name' => $bid->arsitek->user->name,
                                'email' => $bid->arsitek->user->email,
                                'pic' => $this->resolveStorageUrl($bid->arsitek->user->pic),
                            ],
                        ] : null,
                    ];
                });
            }),
            'bids_kontraktor' => $this->whenLoaded('bidsKontraktor', function () {
                return $this->bidsKontraktor->map(function ($bid) {
                    return [
                        'id' => $bid->id,
                        'price' => $bid->price,
                        'price_max' => $bid->price_max,
                        'calculated_total' => $bid->calculated_total,
                        'fee_type' => $bid->fee_type,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'construction_method' => $bid->construction_method,
                        'cost_breakdown' => $bid->cost_breakdown,
                        'workforce_count' => $bid->workforce_count,
                        'equipment_owned' => $bid->equipment_owned,
                        'warranty_months' => $bid->warranty_months,
                        'payment_preference' => $bid->payment_preference,
                        'scopes' => $bid->scopes,
                        'deliverables' => $bid->deliverables,
                        'attachments' => array_filter([
                            $this->resolveStorageUrl($bid->attachment_1),
                            $this->resolveStorageUrl($bid->attachment_2),
                            $this->resolveStorageUrl($bid->attachment_3),
                        ]),
                        'created_at' => $bid->created_at,
                        'offered_by_id' => $bid->offered_by_id,
                        'negotiation_count' => (int) ($bid->negotiation_count ?? 0),
                        'fee_agreed_at' => $bid->fee_agreed_at,
                        'payment_status' => $bid->payment_status,
                        'payment_proof_path' => $this->resolveStorageUrl($bid->payment_proof_path),
                        'verification_notes' => $bid->verification_notes,
                        'proposed_termins' => $bid->proposed_termins,
                        'proposed_milestones' => $bid->proposed_milestones,
                        'proposed_team' => $bid->proposed_team,
                        'pro_signature_url' => $this->resolveSignatureUrl('kontraktor', $bid),
                        'client_signature_url' => $this->resolveSignatureUrl('kontraktor', $bid, true),
                        'is_recommended' => (bool) $bid->is_recommended,
                        'negotiation_logs' => $bid->relationLoaded('negotiationLogs') ? $bid->negotiationLogs->map(fn($log) => [
                            'user_name' => $log->user->name,
                            'round_number' => $log->round_number,
                            'note' => $log->note,
                            'changes' => $log->changes_detected,
                            'created_at' => $log->created_at,
                        ]) : [],
                        'kontraktor_id' => $bid->kontraktor_id,
                        'bidder' => $bid->relationLoaded('kontraktor') && $bid->kontraktor ? [
                            'id' => $bid->kontraktor->id,
                            'name' => $bid->kontraktor->nama ?? $bid->kontraktor->user->name,
                            'phone' => $bid->kontraktor->no_telepon ?? $bid->kontraktor->user->phoneNumber->first()?->contact,
                            'location' => $bid->kontraktor->alamat,
                            'alamat' => $bid->kontraktor->alamat,
                            'lokasi' => $bid->kontraktor->alamat,
                            'average_rating' => $bid->kontraktor->average_rating,
                            'review_count' => $bid->kontraktor->review_count,
                            'foto' => $this->resolveStorageUrl($bid->kontraktor->foto),
                            'spesialisasi' => $bid->kontraktor->spesialisasi,
                            'rate_harga' => $bid->kontraktor->rate_harga,
                            'pengalaman' => $bid->kontraktor->pengalaman,
                            'deskripsi' => $bid->kontraktor->alasan_hire,
                            'pendidikan' => $bid->kontraktor->pendidikan,
                            'file_portofolio' => $this->resolveStorageUrl($bid->kontraktor->file_portofolio),
                            'file_sertifikat' => $this->resolveStorageUrl($bid->kontraktor->file_sertifikat),
                            'user' => [
                                'id' => $bid->kontraktor->user->id,
                                'name' => $bid->kontraktor->user->name,
                                'email' => $bid->kontraktor->user->email,
                                'pic' => $this->resolveStorageUrl($bid->kontraktor->user->pic),
                            ],
                        ] : null,
                    ];
                });
            }),
            'bids_notaris' => $this->whenLoaded('bidsNotaris', function () {
                return $this->bidsNotaris->map(function ($bid) {
                    return [
                        'id' => $bid->id,
                        'price' => $bid->price,
                        'price_max' => $bid->price_max,
                        'calculated_total' => $bid->calculated_total,
                        'fee_type' => $bid->fee_type,
                        'tax_estimate' => $bid->tax_estimate,
                        'selected_services' => $bid->selected_services,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'attachments' => array_filter([
                            $this->resolveStorageUrl($bid->attachment_1),
                            $this->resolveStorageUrl($bid->attachment_2),
                            $this->resolveStorageUrl($bid->attachment_3),
                        ]),
                        'created_at' => $bid->created_at,
                        'offered_by_id' => $bid->offered_by_id,
                        'negotiation_count' => (int) ($bid->negotiation_count ?? 0),
                        'fee_agreed_at' => $bid->fee_agreed_at,
                        'payment_status' => $bid->payment_status,
                        'payment_proof_path' => $this->resolveStorageUrl($bid->payment_proof_path),
                        'verification_notes' => $bid->verification_notes,
                        'proposed_termins' => $bid->proposed_termins,
                        'proposed_milestones' => $bid->proposed_milestones,
                        'pro_signature_url' => $this->resolveSignatureUrl('notaris', $bid),
                        'client_signature_url' => $this->resolveSignatureUrl('notaris', $bid, true),
                        'is_recommended' => (bool) $bid->is_recommended,
                        'negotiation_logs' => $bid->relationLoaded('negotiationLogs') ? $bid->negotiationLogs->map(fn($log) => [
                            'user_name' => $log->user->name,
                            'round_number' => $log->round_number,
                            'note' => $log->note,
                            'changes' => $log->changes_detected,
                            'created_at' => $log->created_at,
                        ]) : [],
                        'notaris_id' => $bid->notaris_id,
                        'bidder' => $bid->relationLoaded('notaris') && $bid->notaris ? [
                            'id' => $bid->notaris->id,
                            'name' => $bid->notaris->nama ?? $bid->notaris->user->name,
                            'phone' => $bid->notaris->no_telp ?? $bid->notaris->user->phoneNumber->first()?->contact,
                            'specialization' => $bid->notaris->spesialisasi,
                            'location' => $bid->notaris->lokasi,
                            'average_rating' => $bid->notaris->average_rating,
                            'review_count' => $bid->notaris->review_count,
                            'foto' => $this->resolveStorageUrl($bid->notaris->foto),
                            'user' => [
                                'id' => $bid->notaris->user->id,
                                'name' => $bid->notaris->user->name,
                                'email' => $bid->notaris->user->email,
                                'pic' => $this->resolveStorageUrl($bid->notaris->user->pic),
                            ],
                        ] : null,
                    ];
                });
            }),
            'bids_interior' => $this->whenLoaded('bidsInterior', function () {
                return $this->bidsInterior->map(function ($bid) {
                    return [
                        'id' => $bid->id,
                        'price' => $bid->price,
                        'price_max' => $bid->price_max,
                        'calculated_total' => $bid->calculated_total,
                        'fee_type' => $bid->fee_type,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'scopes' => $bid->scopes,
                        'deliverables' => $bid->deliverables,
                        'attachments' => array_filter([
                            $this->resolveStorageUrl($bid->attachment_1),
                            $this->resolveStorageUrl($bid->attachment_2),
                            $this->resolveStorageUrl($bid->attachment_3),
                        ]),
                        'created_at' => $bid->created_at,
                        'offered_by_id' => $bid->offered_by_id,
                        'negotiation_count' => (int) ($bid->negotiation_count ?? 0),
                        'fee_agreed_at' => $bid->fee_agreed_at,
                        'payment_status' => $bid->payment_status,
                        'payment_proof_path' => $this->resolveStorageUrl($bid->payment_proof_path),
                        'verification_notes' => $bid->verification_notes,
                        'proposed_termins' => $bid->proposed_termins,
                        'proposed_milestones' => $bid->proposed_milestones,
                        'pro_signature_url' => $this->resolveSignatureUrl('interior', $bid),
                        'client_signature_url' => $this->resolveSignatureUrl('interior', $bid, true),
                        'is_recommended' => (bool) $bid->is_recommended,
                        'negotiation_logs' => $bid->relationLoaded('negotiationLogs') ? $bid->negotiationLogs->map(fn($log) => [
                            'user_name' => $log->user->name,
                            'round_number' => $log->round_number,
                            'note' => $log->note,
                            'changes' => $log->changes_detected,
                            'created_at' => $log->created_at,
                        ]) : [],
                        'interior_id' => $bid->interior_id,
                        'bidder' => $bid->relationLoaded('interior') && $bid->interior ? [
                            'id' => $bid->interior->id,
                            'name' => $bid->interior->nama ?? $bid->interior->user->name,
                            'phone' => $bid->interior->no_telp ?? $bid->interior->user->phoneNumber->first()?->contact,
                            'location' => $bid->interior->lokasi,
                            'lokasi' => $bid->interior->lokasi,
                            'average_rating' => $bid->interior->average_rating,
                            'review_count' => $bid->interior->review_count,
                            'foto' => $this->resolveStorageUrl($bid->interior->foto),
                            'spesialisasi' => $bid->interior->spesialisasi,
                            'rate_harga' => $bid->interior->rate_harga,
                            'pengalaman_tahun' => $bid->interior->pengalaman_tahun,
                            'deskripsi' => $bid->interior->deskripsi,
                            'pendidikan' => $bid->interior->pendidikan,
                            'file_portofolio' => $this->resolveStorageUrl($bid->interior->file_portofolio),
                            'file_sertifikat' => $this->resolveStorageUrl($bid->interior->file_sertifikat),
                            'user' => [
                                'id' => $bid->interior->user->id,
                                'name' => $bid->interior->user->name,
                                'email' => $bid->interior->user->email,
                                'pic' => $this->resolveStorageUrl($bid->interior->user->pic),
                            ],
                        ] : null,
                    ];
                });
            }),
            'bids_project_manager' => $this->whenLoaded('bidsProjectManager', function () {
                return $this->bidsProjectManager->map(function ($bid) {
                    return [
                        'id' => $bid->id,
                        'price' => $bid->price,
                        'price_max' => $bid->price_max,
                        'calculated_total' => $bid->calculated_total,
                        'fee_type' => $bid->fee_type,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'scopes' => $bid->scopes,
                        'deliverables' => $bid->deliverables,
                        'pm_id' => $bid->pm_id,
                        'offered_by_id' => $bid->offered_by_id,
                        'negotiation_count' => (int) ($bid->negotiation_count ?? 0),
                        'fee_agreed_at' => $bid->fee_agreed_at,
                        'payment_status' => $bid->payment_status,
                        'payment_proof_path' => $this->resolveStorageUrl($bid->payment_proof_path),
                        'verification_notes' => $bid->verification_notes,
                        'proposed_termins' => $bid->proposed_termins,
                        'proposed_milestones' => $bid->proposed_milestones,
                        'pro_signature_url' => $this->resolveSignatureUrl('project_manager', $bid),
                        'client_signature_url' => $this->resolveSignatureUrl('project_manager', $bid, true),
                        'negotiation_logs' => $bid->relationLoaded('negotiationLogs') ? $bid->negotiationLogs->map(fn($log) => [
                            'user_name' => $log->user->name,
                            'round_number' => $log->round_number,
                            'note' => $log->note,
                            'changes' => $log->changes_detected,
                            'created_at' => $log->created_at,
                        ]) : [],
                        'proposal' => $bid->proposal,
                        'attachment_1' => $this->resolveStorageUrl($bid->attachment_1),
                        'attachment_2' => $this->resolveStorageUrl($bid->attachment_2),
                        'attachment_3' => $this->resolveStorageUrl($bid->attachment_3),
                        'created_at' => $bid->created_at,
                        'bidder' => $bid->relationLoaded('pm') && $bid->pm ? [
                            'id' => $bid->pm->id,
                            'name' => $bid->pm->nama ?? $bid->pm->user?->name ?? 'Unknown PM',
                            'verification_status' => $bid->pm->verification_status,
                            'pengalaman_tahun' => $bid->pm->pengalaman_tahun,
                            'deskripsi' => $bid->pm->deskripsi,
                            'spesialisasi' => $bid->pm->spesialisasi,
                            'lokasi' => $bid->pm->lokasi,
                            'rate_harga' => $bid->pm->rate_harga,
                            'alasan_hire' => $bid->pm->alasan_hire,
                            'pendidikan' => $bid->pm->pendidikan,
                            'foto' => $this->resolveStorageUrl($bid->pm->foto),
                            'file_portofolio' => $bid->pm->file_portofolio,
                            'file_sertifikat' => $bid->pm->file_sertifikat,
                            'entity_type' => $bid->pm->entity_type,
                            'company_name' => $bid->pm->company_name,
                            'company_license' => $bid->pm->company_license,
                            'identity_number' => $bid->pm->identity_number,
                            'npwp_number' => $bid->pm->npwp_number,
                            'siup_number' => $bid->pm->siup_number,
                            'user' => $bid->pm->user ? [
                                'id' => $bid->pm->user->id,
                                'name' => $bid->pm->user->name,
                                'email' => $bid->pm->user->email,
                                'phone_number' => $bid->pm->no_telp ?? $bid->pm->user->phoneNumber->first()?->contact,
                                'pic' => $this->resolveStorageUrl($bid->pm->user->pic),
                            ] : null,
                            'phone' => $bid->pm->no_telp ?? $bid->pm->user->phoneNumber->first()?->contact,
                        ] : null,
                    ];
                });
            }),
            'milestones' => $this->whenLoaded('milestones', function () {
                return $this->milestones->map(function ($milestone) {
                    return [
                        'id' => $milestone->id,
                        'title' => $milestone->title,
                        'description' => $milestone->description,
                        'type' => $milestone->type,
                        'content' => isset($milestone->content['gallery']) ? array_merge($milestone->content, ['gallery' => $milestone->gallery_urls]) : $milestone->content,
                        'approval_status' => $milestone->approval_status,
                        'phase_context' => $milestone->phase_context,
                        'start_date' => $milestone->start_date,
                        'due_date' => $milestone->due_date,
                        'is_completed' => (bool) $milestone->is_completed,
                        'arsitek_id' => $milestone->arsitek_id,
                        'kontraktor_id' => $milestone->kontraktor_id,
                        'notaris_id' => $milestone->notaris_id,
                        'interior_id' => $milestone->interior_id,
                        'structural_id' => $milestone->structural_id,
                        'mep_id' => $milestone->mep_id,
                        'review_note' => $milestone->review_note,
                        'review_status' => $milestone->review_status,
                        'created_at' => $milestone->created_at,
                    ];
                });
            }),
            'review_arsitek' => $this->whenLoaded('ratings', function () {
                $rating = $this->ratings->first();

                return $rating ? [
                    'rating' => $rating->rating,
                    'comment' => $rating->komentar,
                    'created_at' => $rating->created_at,
                ] : null;
            }),
            'review_kontraktor' => $this->whenLoaded('kontraktorRating', function () {
                return $this->kontraktorRating ? [
                    'rating' => $this->kontraktorRating->rating,
                    'comment' => $this->kontraktorRating->komentar,
                    'created_at' => $this->kontraktorRating->created_at,
                ] : null;
            }),
            'arsitek' => $this->whenLoaded('arsitek', function () {
                return [
                    'id' => $this->arsitek->id,
                    'verification_status' => $this->arsitek->verification_status,
                    'experience_years' => $this->arsitek->pengalaman_tahun,
                    'rating' => $this->arsitek->average_rating,
                    'average_rating' => $this->arsitek->average_rating,
                    'user' => [
                        'id' => $this->arsitek->user->id,
                        'name' => $this->arsitek->user->name,
                        'email' => $this->arsitek->user->email,
                        'phone_number' => $this->arsitek->no_telp,
                    ],
                ];
            }),
            'kontraktor' => $this->whenLoaded('kontraktor', function () {
                return [
                    'id' => $this->kontraktor->id,
                    'verification_status' => $this->kontraktor->verification_status,
                    'experience_years' => $this->kontraktor->pengalaman_tahun ?? 0,
                    'rating' => $this->kontraktor->average_rating,
                    'average_rating' => $this->kontraktor->average_rating,
                    'user' => [
                        'id' => $this->kontraktor->user->id,
                        'name' => $this->kontraktor->user->name,
                        'email' => $this->kontraktor->user->email,
                        'phone_number' => $this->kontraktor->no_telepon,
                    ],
                ];
            }),
            'notaris' => $this->whenLoaded('notaris', function () {
                return [
                    'id' => $this->notaris->id,
                    'verification_status' => $this->notaris->verification_status,
                    'experience_years' => $this->notaris->pengalaman_tahun ?? 0,
                    'specialization' => $this->notaris->spesialisasi,
                    'rating' => $this->notaris->average_rating,
                    'average_rating' => $this->notaris->average_rating,
                    'user' => [
                        'id' => $this->notaris->user->id,
                        'name' => $this->notaris->user->name,
                        'email' => $this->notaris->user->email,
                        'phone_number' => $this->notaris->no_telp,
                    ],
                ];
            }),
            'interior' => $this->whenLoaded('interior', function () {
                return [
                    'id' => $this->interior->id,
                    'verification_status' => $this->interior->verification_status,
                    'experience_years' => $this->interior->pengalaman_tahun ?? 0,
                    'specialization' => $this->interior->spesialisasi,
                    'rating' => $this->interior->average_rating,
                    'average_rating' => $this->interior->average_rating,
                    'user' => [
                        'id' => $this->interior->user->id,
                        'name' => $this->interior->user->name,
                        'email' => $this->interior->user->email,
                        'phone_number' => $this->interior->no_telp,
                    ],
                ];
            }),
            'requirements' => $this->whenLoaded('requirements', function () {
                return $this->requirements->map(fn($req) => [
                    'id' => $req->id,
                    'name' => $req->name,
                    'quantity_required' => $req->quantity_required,
                    'quantity_procured_externally' => $req->quantity_procured_externally,
                    'external_cost' => $req->external_cost,
                    'quantity_on_site' => $req->quantity_on_site,
                    'quantity_used' => $req->quantity_used,
                    'unit' => $req->unit,
                    'quality_level' => $req->quality_level,
                    'image_url' => $this->resolveStorageUrl($req->image_path),
                    'created_at' => $req->created_at,
                ]);
            }),
            'project_manager' => $this->whenLoaded('projectManager', function () {
                if (!$this->projectManager) return null;
                return [
                    'id' => $this->projectManager->id,
                    'nama' => $this->projectManager->nama ?? $this->projectManager->user?->name ?? 'Unknown PM',
                    'verification_status' => $this->projectManager->verification_status,
                    'pengalaman_tahun' => $this->projectManager->pengalaman_tahun ?? 0,
                    'rating' => $this->projectManager->average_rating,
                    'user' => $this->projectManager->user ? [
                        'id' => $this->projectManager->user->id,
                        'name' => $this->projectManager->user->name,
                        'email' => $this->projectManager->user->email,
                    ] : null,
                    'phone_number' => $this->projectManager->no_telp ?? $this->projectManager->user?->phoneNumber->first()?->contact,
                ];
            }),
            'bids_structural' => $this->whenLoaded('bidsStructural', function () {
                return $this->bidsStructural->map(function ($bid) {
                    return [
                        'id' => $bid->id,
                        'price' => $bid->price,
                        'price_max' => $bid->price_max,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'scopes' => $bid->scopes,
                        'deliverables' => $bid->deliverables,
                        'attachments' => array_filter([
                            $this->resolveStorageUrl($bid->attachment_1),
                            $this->resolveStorageUrl($bid->attachment_2),
                            $this->resolveStorageUrl($bid->attachment_3),
                        ]),
                        'created_at' => $bid->created_at,
                        'structural_id' => $bid->structural_id,
                        'offered_by_id' => $bid->offered_by_id,
                        'negotiation_count' => (int) ($bid->negotiation_count ?? 0),
                        'fee_agreed_at' => $bid->fee_agreed_at,
                        'payment_status' => $bid->payment_status,
                        'payment_proof_path' => $this->resolveStorageUrl($bid->payment_proof_path),
                        'verification_notes' => $bid->verification_notes,
                        'proposed_termins' => $bid->proposed_termins,
                        'proposed_milestones' => $bid->proposed_milestones,
                        'pro_signature_url' => $this->resolveSignatureUrl('structural', $bid),
                        'client_signature_url' => $this->resolveSignatureUrl('structural', $bid, true),
                        'negotiation_logs' => $bid->relationLoaded('negotiationLogs') ? $bid->negotiationLogs->map(fn($log) => [
                            'user_name' => $log->user->name,
                            'round_number' => $log->round_number,
                            'note' => $log->note,
                            'changes' => $log->changes_detected,
                            'created_at' => $log->created_at,
                        ]) : [],
                        'fee_type' => $bid->fee_type,
                        'calculated_total' => $bid->calculated_total,
                        'is_recommended' => (bool) $bid->is_recommended,
                        'interview_notes' => $bid->interview_notes,
                        'bidder' => $bid->relationLoaded('structuralEngineer') && $bid->structuralEngineer ? [
                            'id' => $bid->structuralEngineer->id,
                            'name' => $bid->structuralEngineer->nama ?? $bid->structuralEngineer->user->name,
                            'phone' => $bid->structuralEngineer->no_telp ?? $bid->structuralEngineer->user->phoneNumber->first()?->contact,
                            'specialization' => $bid->structuralEngineer->spesialisasi,
                            'experience_years' => $bid->structuralEngineer->pengalaman_tahun,
                            'rate' => $bid->structuralEngineer->rate_harga,
                            'location' => $bid->structuralEngineer->lokasi,
                            'deskripsi' => $bid->structuralEngineer->deskripsi,
                            'alasan_hire' => $bid->structuralEngineer->alasan_hire,
                            'pendidikan' => $bid->structuralEngineer->pendidikan,
                            'foto' => $this->resolveStorageUrl($bid->structuralEngineer->foto),
                            'file_portofolio' => $bid->structuralEngineer->file_portofolio,
                            'file_sertifikat' => $bid->structuralEngineer->file_sertifikat,
                            'verification_status' => $bid->structuralEngineer->verification_status,
                            'entity_type' => $bid->structuralEngineer->entity_type,
                            'company_name' => $bid->structuralEngineer->company_name,
                            'company_license' => $bid->structuralEngineer->company_license,
                            'identity_number' => $bid->structuralEngineer->identity_number,
                            'npwp_number' => $bid->structuralEngineer->npwp_number,
                            'siup_number' => $bid->structuralEngineer->siup_number,
                            'user' => [
                                'id' => $bid->structuralEngineer->user->id,
                                'name' => $bid->structuralEngineer->user->name,
                                'email' => $bid->structuralEngineer->user->email,
                                'pic' => $this->resolveStorageUrl($bid->structuralEngineer->user->pic),
                            ],
                        ] : null,
                    ];
                });
            }),
            'bids_mep' => $this->whenLoaded('bidsMep', function () {
                return $this->bidsMep->map(function ($bid) {
                    return [
                        'id' => $bid->id,
                        'price' => $bid->price,
                        'price_max' => $bid->price_max,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'scopes' => $bid->scopes,
                        'deliverables' => $bid->deliverables,
                        'attachments' => array_filter([
                            $this->resolveStorageUrl($bid->attachment_1),
                            $this->resolveStorageUrl($bid->attachment_2),
                            $this->resolveStorageUrl($bid->attachment_3),
                        ]),
                        'created_at' => $bid->created_at,
                        'mep_id' => $bid->mep_id,
                        'offered_by_id' => $bid->offered_by_id,
                        'negotiation_count' => (int) ($bid->negotiation_count ?? 0),
                        'fee_agreed_at' => $bid->fee_agreed_at,
                        'payment_status' => $bid->payment_status,
                        'payment_proof_path' => $this->resolveStorageUrl($bid->payment_proof_path),
                        'verification_notes' => $bid->verification_notes,
                        'proposed_termins' => $bid->proposed_termins,
                        'proposed_milestones' => $bid->proposed_milestones,
                        'pro_signature_url' => $this->resolveSignatureUrl('mep', $bid),
                        'client_signature_url' => $this->resolveSignatureUrl('mep', $bid, true),
                        'negotiation_logs' => $bid->relationLoaded('negotiationLogs') ? $bid->negotiationLogs->map(fn($log) => [
                            'user_name' => $log->user->name,
                            'round_number' => $log->round_number,
                            'note' => $log->note,
                            'changes' => $log->changes_detected,
                            'created_at' => $log->created_at,
                        ]) : [],
                        'fee_type' => $bid->fee_type,
                        'calculated_total' => $bid->calculated_total,
                        'is_recommended' => (bool) $bid->is_recommended,
                        'interview_notes' => $bid->interview_notes,
                        'bidder' => $bid->relationLoaded('mepEngineer') && $bid->mepEngineer ? [
                            'id' => $bid->mepEngineer->id,
                            'name' => $bid->mepEngineer->nama ?? $bid->mepEngineer->user->name,
                            'phone' => $bid->mepEngineer->no_telp ?? $bid->mepEngineer->user->phoneNumber->first()?->contact,
                            'specialization' => $bid->mepEngineer->spesialisasi,
                            'experience_years' => $bid->mepEngineer->pengalaman_tahun,
                            'rate' => $bid->mepEngineer->rate_harga,
                            'location' => $bid->mepEngineer->lokasi,
                            'deskripsi' => $bid->mepEngineer->deskripsi,
                            'alasan_hire' => $bid->mepEngineer->alasan_hire,
                            'pendidikan' => $bid->mepEngineer->pendidikan,
                            'foto' => $this->resolveStorageUrl($bid->mepEngineer->foto),
                            'file_portofolio' => $bid->mepEngineer->file_portofolio,
                            'file_sertifikat' => $bid->mepEngineer->file_sertifikat,
                            'verification_status' => $bid->mepEngineer->verification_status,
                            'entity_type' => $bid->mepEngineer->entity_type,
                            'company_name' => $bid->mepEngineer->company_name,
                            'company_license' => $bid->mepEngineer->company_license,
                            'identity_number' => $bid->mepEngineer->identity_number,
                            'npwp_number' => $bid->mepEngineer->npwp_number,
                            'siup_number' => $bid->mepEngineer->siup_number,
                            'user' => [
                                'id' => $bid->mepEngineer->user->id,
                                'name' => $bid->mepEngineer->user->name,
                                'email' => $bid->mepEngineer->user->email,
                                'pic' => $this->resolveStorageUrl($bid->mepEngineer->user->pic),
                            ],
                        ] : null,
                    ];
                });
            }),
            'structural' => $this->whenLoaded('structuralEngineer', function () {
                return [
                    'id' => $this->structuralEngineer->id,
                    'name' => $this->structuralEngineer->nama,
                    'user' => [
                        'id' => $this->structuralEngineer->user->id,
                        'name' => $this->structuralEngineer->user->name,
                    ],
                ];
            }),
            'mep' => $this->whenLoaded('mepEngineer', function () {
                return [
                    'id' => $this->mepEngineer->id,
                    'name' => $this->mepEngineer->nama,
                    'user' => [
                        'id' => $this->mepEngineer->user->id,
                        'name' => $this->mepEngineer->user->name,
                    ],
                ];
            }),
            'accepted_pm_bid' => $this->whenLoaded('bidsProjectManager', function () {
                $bid = $this->bidsProjectManager->first(fn($b) => in_array($b->status, ['accepted', 'awaiting_payment', 'active', 'contract_pending']));
                if (!$bid) return null;
                return [
                    'id' => $bid->id,
                    'price' => $bid->price,
                    'proposal' => $bid->proposal,
                    'fee_type' => $bid->fee_type,
                    'scopes' => $bid->scopes,
                    'deliverables' => $bid->deliverables,
                    'estimated_duration' => $bid->estimated_duration,
                    'duration_unit' => $bid->duration_unit,
                ];
            }),
            'accepted_notaris_bid' => $this->whenLoaded('bidsNotaris', function () {
                $bid = $this->bidsNotaris->first(fn($b) => in_array($b->status, ['accepted', 'awaiting_payment', 'active', 'contract_pending']));
                if (!$bid) return null;
                return [
                    'id' => $bid->id,
                    'price' => $bid->price,
                    'fee_type' => $bid->fee_type,
                    'calculated_total' => $bid->calculated_total,
                    'tax_estimate' => $bid->tax_estimate,
                    'selected_services' => $bid->selected_services,
                    'proposal' => $bid->proposal,
                    'estimated_duration' => $bid->estimated_duration,
                    'duration_unit' => $bid->duration_unit,
                    'notaris' => $bid->notaris ? [
                        'id' => $bid->notaris->id,
                        'nama' => $bid->notaris->nama,
                        'services' => $bid->notaris->services->map(fn($s) => [
                            'id' => $s->id,
                            'title' => $s->title,
                            'description' => $s->description,
                            'price' => $s->price,
                        ])
                    ] : null,
                ];
            }),
            'accepted_arsitek_bid' => $this->whenLoaded('bidsArsitek', function () {
                $bid = $this->bidsArsitek->first(fn($b) => in_array($b->status, ['accepted', 'awaiting_payment', 'active', 'contract_pending']));
                if (!$bid) return null;
                return [
                    'id' => $bid->id,
                    'price' => $bid->price,
                    'proposal' => $bid->proposal,
                    'scopes' => $bid->scopes,
                    'deliverables' => $bid->deliverables,
                    'estimated_duration' => $bid->estimated_duration,
                    'duration_unit' => $bid->duration_unit,
                ];
            }),
            'accepted_kontraktor_bid' => $this->whenLoaded('bidsKontraktor', function () {
                $bid = $this->bidsKontraktor->first(fn($b) => in_array($b->status, ['accepted', 'awaiting_payment', 'active', 'contract_pending']));
                if (!$bid) return null;
                return [
                    'id' => $bid->id,
                    'price' => $bid->price,
                    'proposal' => $bid->proposal,
                    'scopes' => $bid->scopes,
                    'deliverables' => $bid->deliverables,
                    'proposed_team' => $bid->proposed_team,
                    'estimated_duration' => $bid->estimated_duration,
                    'duration_unit' => $bid->duration_unit,
                ];
            }),
            'accepted_interior_bid' => $this->whenLoaded('bidsInterior', function () {
                $bid = $this->bidsInterior->first(fn($b) => in_array($b->status, ['accepted', 'awaiting_payment', 'active', 'contract_pending']));
                if (!$bid) return null;
                return [
                    'id' => $bid->id,
                    'price' => $bid->price,
                    'proposal' => $bid->proposal,
                    'scopes' => $bid->scopes,
                    'deliverables' => $bid->deliverables,
                    'estimated_duration' => $bid->estimated_duration,
                    'duration_unit' => $bid->duration_unit,
                ];
            }),
            'accepted_structural_bid' => $this->whenLoaded('bidsStructural', function () {
                $bid = $this->bidsStructural->first(fn($b) => in_array($b->status, ['accepted', 'awaiting_payment', 'active', 'contract_pending']));
                if (!$bid) return null;
                return [
                    'id' => $bid->id,
                    'price' => $bid->price,
                    'proposal' => $bid->proposal,
                    'estimated_duration' => $bid->estimated_duration,
                    'duration_unit' => $bid->duration_unit,
                ];
            }),
            'accepted_mep_bid' => $this->whenLoaded('bidsMep', function () {
                $bid = $this->bidsMep->first(fn($b) => in_array($b->status, ['accepted', 'awaiting_payment', 'active', 'contract_pending']));
                if (!$bid) return null;
                return [
                    'id' => $bid->id,
                    'price' => $bid->price,
                    'proposal' => $bid->proposal,
                    'estimated_duration' => $bid->estimated_duration,
                    'duration_unit' => $bid->duration_unit,
                ];
            }),
            'payment_termins' => $this->whenLoaded('paymentTermins', function () {
                return $this->paymentTermins->map(fn($t) => [
                    'id' => $t->id,
                    'label' => $t->label,
                    'percentage' => $t->percentage,
                    'amount' => $t->amount,
                    'notes' => $t->notes,
                    'status' => $t->status,
                    'milestone_id' => $t->milestone_id,
                    'milestone_title' => $t->milestone?->title,
                    'milestone' => $t->milestone ? [
                        'id' => $t->milestone->id,
                        'title' => $t->milestone->title,
                        'approval_status' => $t->milestone->approval_status,
                    ] : null,
                    'proposal' => $t->trigger_description,
                    'role_type' => $t->role_type,
                    'recipient_id' => $t->recipient_id,
                    'retention_amount' => (float) $t->retention_amount,
                    'net_amount' => (float) $t->net_amount,
                    'paid_at' => $t->paid_at,
                    'payment_proof_path' => $this->resolveStorageUrl($t->payment_proof_path),
                    'verification_notes' => $t->verification_notes,
                ]);
            }),
            'activity_logs' => $this->whenLoaded('activityLogs', function() {
                return $this->activityLogs->map(fn($log) => [
                    'id' => $log->id,
                    'action' => $log->action,
                    'description' => $log->details,
                    'created_at' => $log->created_at,
                ]);
            }),
            'sub_professionals' => $this->whenLoaded('subProfessionals', function () {
                return $this->subProfessionals->map(fn($sp) => [
                    'id' => $sp->id,
                    'user_id' => $sp->user_id,
                    'parent_role' => $sp->parent_role,
                    'sub_role' => $sp->sub_role,
                    'assigned_by' => $sp->assigned_by,
                    'status' => $sp->status,
                    'rate' => $sp->rate,
                    'scope_notes' => $sp->scope_notes,
                    'lead_pro_notes' => $sp->lead_pro_notes,
                    'suggested_fee' => $sp->suggested_fee,
                    'accepted_at' => $sp->accepted_at,
                    'recommended_at' => $sp->recommended_at,
                    'hired_at' => $sp->hired_at,
                    'completed_at' => $sp->completed_at,
                    'user' => $sp->user ? [
                        'id' => $sp->user->id,
                        'name' => $sp->user->name,
                        'email' => $sp->user->email,
                        'role_type' => $sp->user->role_type,
                        'pic' => $sp->user->pic,
                        'phone_number' => $sp->user->phone_number ?? $sp->user->phone ?? ($sp->user->relationLoaded('phoneNumber') ? $sp->user->phoneNumber->first()?->contact : null) ?? '',
                    ] : null,
                ]);
            }),
        ];
    }
    /**
     * Resolve specialist profile data with robust name resolution.
     */
    private function resolveSpecialistProfile(string $role): ?array
    {
        $idField = $role === 'structural' ? 'structural_id' : ($role === 'mep' ? 'mep_id' : 'selected_interior_id');
        $relation = $role === 'structural' ? 'structuralEngineer' : ($role === 'mep' ? 'mepEngineer' : 'interior');
        $bidRelation = $role === 'structural' ? 'bidsStructural' : ($role === 'mep' ? 'bidsMep' : 'bidsInterior');
        $fallbackTitle = $role === 'structural' ? 'Structural Engineer' : ($role === 'mep' ? 'MEP Engineer' : 'Interior Designer');

        $profileId = $this->$idField;
        
        // 1. Try primary professional relation
        $engineer = $this->$relation;
        
        // 2. Try Sub-Professional assignment (firm roster or platform hired)
        $subPro = $this->subProfessionals
            ? $this->subProfessionals->where('sub_role', $role)->where('status', 'active')->first()
            : \App\Models\ProjectSubProfessional::where('project_id', $this->id)
                ->where('sub_role', $role)
                ->where('status', 'active')
                ->first();

        if (!$profileId && !$subPro) {
            return null;
        }

        $name = $engineer?->company_name ?? 
                $engineer?->nama ?? 
                $engineer?->user?->name ?? 
                // Check if the profileId points to a TeamMember (common for internal assignments)
                ($profileId && !$engineer ? \App\Models\TeamMember::find($profileId)?->name : null) ??
                // If it's a SubPro, check if it's a placeholder (user_id matches assigned_by)
                ($subPro && $subPro->user_id !== $subPro->assigned_by ? $subPro->user?->name : null) ??
                $subPro?->name ?? 
                ($subPro && $subPro->lead_pro_notes ? str_replace(['Assigned via Paid Addendum (Manual): ', 'Team: '], '', $subPro->lead_pro_notes) : null) ??
                $fallbackTitle;

        $type = ($profileId && $engineer) ? 'platform_hired' : 'internal_team';

        $paymentStatus = $this->$bidRelation()
            ->whereIn('status', ['accepted', 'awaiting_payment', 'active', 'contract_pending', 'completed'])
            ->first()?->payment_status ?? 
            (\App\Models\ProjectAddendum::where('project_id', $this->id)
                ->where(function($q) use ($role) {
                    $q->where('role_type', $role)
                      ->orWhere('specialist_type', $role);
                })
                ->whereIn('type', ['specialist_assignment', 'specialist_request'])
                ->where('status', 'paid')
                ->exists() ? 'paid' : (
                    \App\Models\ProjectAddendum::where('project_id', $this->id)
                        ->where(function($q) use ($role) {
                            $q->where('role_type', $role)
                              ->orWhere('specialist_type', $role);
                        })
                        ->whereIn('type', ['specialist_assignment', 'specialist_request'])
                        ->whereIn('status', ['authorized', 'verifying', 'approved_unpaid'])
                        ->first()?->status ?? 'unpaid'
                ));

        return [
            'name' => $name,
            'type' => $type,
            'payment_status' => $paymentStatus,
            'sub_professional_id' => $subPro?->id,
            'user_id' => $engineer?->user_id ?? ($subPro && $subPro->user_id !== $subPro->assigned_by ? $subPro->user_id : null),
            'is_internal' => ($profileId && !$engineer) || ($subPro && $subPro->user_id === $subPro->assigned_by)
        ];
    }

    private function resolveSignatureUrl(string $roleType, $bid, bool $isClient = false): ?string
    {
        $status = $bid instanceof \Illuminate\Database\Eloquent\Model ? $bid->status : null;
        if (!$status) {
            return null;
        }

        // Professional signature is only available if status is contract_pending, awaiting_payment, or accepted
        // Client signature is only available if status is awaiting_payment or accepted
        if ($isClient) {
            if (!in_array($status, ['awaiting_payment', 'accepted'])) {
                return null;
            }
        } else {
            if (!in_array($status, ['contract_pending', 'awaiting_payment', 'accepted'])) {
                return null;
            }
        }

        $bidId = $bid instanceof \Illuminate\Database\Eloquent\Model ? $bid->id : $bid;
        $createdAt = $bid instanceof \Illuminate\Database\Eloquent\Model ? $bid->created_at?->timestamp : null;
        $timestamp = $createdAt ?: time();
        $suffix = $isClient ? '_client' : '';
        $clientSuffixPath = $isClient ? '/client' : '';
        
        $token = hash_hmac('sha256', "{$roleType}_{$bidId}_{$timestamp}{$suffix}", config('app.key'));
        return url("/api/contract-signatures/{$roleType}/{$bidId}/{$timestamp}{$clientSuffixPath}?token={$token}");
    }

    private function resolveStorageUrl(?string $path): ?string
    {
        if (!$path) {
            return null;
        }

        // 1. Static runtime memory cache
        static $resolvedUrls = [];
        if (isset($resolvedUrls[$path])) {
            return $resolvedUrls[$path];
        }

        $originalPath = $path;

        // Extract relative path if it's a URL pointing to our local storage or S3 bucket
        $s3Prefix = 'https://t3.storageapi.dev/fourc-storage-fneicjrzkq3/';
        
        if (str_starts_with($path, $s3Prefix)) {
            $path = substr($path, strlen($s3Prefix));
        } elseif (str_contains($path, '/storage/')) {
            // e.g. http://127.0.0.1:8000/storage/design_briefs/... or /storage/design_briefs/...
            $parts = explode('/storage/', $path);
            $path = end($parts);
        } elseif (filter_var($path, FILTER_VALIDATE_URL)) {
            // External URLs (like Unsplash, mockups, etc.) should be returned as-is
            $resolvedUrls[$originalPath] = $path;
            return $path;
        }

        // 2. Direct public URL generation (0ms concatenation)
        $driver = config('filesystems.disks.public.driver', 'local');
        if ($driver === 's3') {
            $publicUrl = config('filesystems.disks.public.url');
            $url = rtrim($publicUrl, '/') . '/' . ltrim($path, '/');
        } else {
            $url = asset('storage/' . $path);
        }

        $resolvedUrls[$originalPath] = $url;
        return $url;
    }

    private function resolveDesignDetailsUrls($details): ?array
    {
        if (empty($details) || !is_array($details)) {
            return $details;
        }

        if (isset($details['requirements']) && is_array($details['requirements'])) {
            $details['requirements'] = array_map(function ($req) {
                if (isset($req['image_url'])) {
                    $req['image_url'] = $this->resolveStorageUrl($req['image_url']);
                }
                return $req;
            }, $details['requirements']);
        }

        return $details;
    }
}
