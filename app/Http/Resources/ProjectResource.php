<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = auth('sanctum')->user();
        $hasSubmittedBid = false;

        if ($user) {
            if ($user->role_type === 'arsitek' && $user->arsitek) {
                $hasSubmittedBid = $this->bidsArsitek()->where('arsitek_id', $user->arsitek->id)->exists();
            } elseif ($user->role_type === 'kontraktor' && $user->kontraktor) {
                $hasSubmittedBid = $this->bidsKontraktor()->where('kontraktor_id', $user->kontraktor->id)->exists();
            } elseif ($user->role_type === 'notaris' && $user->notaris_profile) {
                $hasSubmittedBid = $this->bidsNotaris()->where('notaris_id', $user->notaris_profile->id)->exists();
            } elseif ($user->role_type === 'interior' && $user->interior_profile) {
                $hasSubmittedBid = $this->bidsInterior()->where('interior_id', $user->interior_profile->id)->exists();
            } elseif ($user->role_type === 'project_manager' && $user->project_manager) {
                $hasSubmittedBid = $this->bidsProjectManager()->where('pm_id', $user->project_manager->id)->exists();
            } elseif ($user->role_type === 'structural' && $user->structural_profile) {
                $hasSubmittedBid = $this->bidsStructural()->where('structural_id', $user->structural_profile->id)->exists();
            } elseif ($user->role_type === 'mep' && $user->mep_profile) {
                $hasSubmittedBid = $this->bidsMep()->where('mep_id', $user->mep_profile->id)->exists();
            }
        }

        return [
            'id' => $this->id,
            'has_submitted_bid' => $hasSubmittedBid,
            'title' => $this->title,
            'description' => $this->description,
            'budget' => $this->budget,
            'location' => $this->lokasi,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'province' => $this->province,
            'city' => $this->city,
            'kecamatan' => $this->kecamatan,
            'kelurahan' => $this->kelurahan,
            'postal_code' => $this->postal_code,
            'street_name' => $this->street_name,
            'type' => $this->jenis_proyek,
            'target_role' => $this->target_role,
            'status' => $this->status,
            'project_category' => $this->project_category,
            'deadline' => $this->deadline,
            'attachment' => $this->attachment,
            'owner_id' => $this->user_id,
            'user_id' => $this->user_id,
            'selected_arsitek_id' => $this->selected_arsitek_id,
            'selected_kontraktor_id' => $this->selected_kontraktor_id,
            'selected_notaris_id' => $this->selected_notaris_id,
            'selected_interior_id' => $this->selected_interior_id,
            'completed_phases' => $this->completed_phases ?? [],
            'needed_phases' => $this->needed_phases ?? [],
            'design_completed_at' => $this->design_completed_at,
            'design_details' => $this->design_details,
            'legal_requirements' => $this->legal_requirements ?? [],
            'construction_completed_at' => $this->construction_completed_at,
            'construction_locked_at' => $this->construction_locked_at,
            'interior_completed_at' => $this->interior_completed_at,
            'construction_details' => $this->construction_details,
            'interior_details' => $this->interior_details,
            'interior_locked_at' => $this->interior_locked_at,
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
            'retention_balance' => (float) $this->paymentTermins()->where('role_type', 'kontraktor')->sum('retention_amount'),
            'snag_counts' => [
                'open' => $this->snagItems()->where('status', 'open')->count(),
                'in_progress' => $this->snagItems()->where('status', 'in_progress')->count(),
                'resolved' => $this->snagItems()->where('status', 'resolved')->count(),
                'accepted' => $this->snagItems()->where('status', 'accepted')->count(),
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
                'total_cost_impact' => (float) $this->changeOrders()->where('status', 'owner_approved')->sum('cost_impact'),
                'pending_count' => $this->changeOrders()->whereNotIn('status', ['rejected', 'implemented'])->count(),
            ],
            'wants_project_manager' => (bool) $this->wants_project_manager,
            'requires_structural' => $this->requires_structural,
            'requires_mep' => $this->requires_mep,
            'planning_status' => $this->planning_status,
            'negotiated_fee' => $this->negotiated_fee,
            'payment_instructions' => $this->payment_instructions,
            'planning_submitted_at' => $this->planning_submitted_at,
            'planning_approved_at' => $this->planning_approved_at,
            'design_payment_verified_at' => $this->design_payment_verified_at,
            'design_locked_at' => $this->design_locked_at,
            'pm_id' => $this->pm_id,
            'pm_audit_notes' => $this->pm_audit_notes,
            'pm_audit_attachments' => collect($this->pm_audit_attachments ?? [])->map(fn($path) => asset('storage/' . $path))->toArray(),
            'architect_notes' => $this->architect_notes,
            'planning_iteration' => (int) ($this->planning_iteration ?? 0),
            'structural_id' => $this->structural_id,
            'mep_id' => $this->mep_id,
            'structural_approved_at' => $this->structural_approved_at,
            'mep_approved_at' => $this->mep_approved_at,
            'share_token' => $this->share_token,
            'legal_detail' => $this->legal_detail,
            'wants_to_discuss_later' => (bool) $this->wants_to_discuss_later,
            'published_bidding_roles' => $this->published_bidding_roles ?? [],
            'bidding_choices' => $this->bidding_choices ?? [],
            'documents' => $this->whenLoaded('documents', function () {
                return $this->documents->map(fn ($doc) => [
                    'id' => $doc->id,
                    'file_name' => $doc->file_name,
                    'file_path' => asset('storage/' . $doc->file_path),
                    'file_type' => $doc->file_type,
                    'category' => $doc->category,
                    'status' => $doc->status,
                    'target_role' => $doc->target_role,
                    'uploader' => $doc->uploader ? [
                        'id' => $doc->uploader->id,
                        'name' => $doc->uploader->name,
                        'role_type' => $doc->uploader->role_type,
                    ] : null,
                    'created_at' => $doc->created_at,
                ]);
            }),
            'external_vendors' => $this->externalVendors->map(fn($v) => [
                'id' => $v->id,
                'phase_role' => $v->phase_role,
                'company_name' => $v->company_name,
                'contact_person' => $v->contact_person,
                'phone_number' => $v->phone_number,
                'email' => $v->email,
                'agreed_fee' => $v->agreed_fee,
            ]),
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
                    'title' => $a->title,
                    'description' => $a->description,
                    'amount' => (string) $a->amount,
                    'status' => $a->status,
                    'paid_at' => $a->paid_at,
                    'created_at' => $a->created_at,
                ]);
            }),
            'images' => $this->whenLoaded('images', function () {
                return $this->images->map(fn ($img) => [
                    'id' => $img->id,
                    'url' => asset('storage/'.$img->image_path),
                    'sort_order' => $img->sort_order,
                ]);
            }),
            'bids_arsitek' => $this->whenLoaded('bidsArsitek', function () {
                return $this->bidsArsitek->map(function ($bid) {
                    return [
                        'id' => $bid->id,
                        'price' => $bid->price,
                        'calculated_total' => $bid->calculated_total,
                        'fee_type' => $bid->fee_type,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'scopes' => $bid->scopes,
                        'deliverables' => $bid->deliverables,
                        'attachments' => array_filter([
                            $bid->attachment_1 ? asset('storage/'.$bid->attachment_1) : null,
                            $bid->attachment_2 ? asset('storage/'.$bid->attachment_2) : null,
                            $bid->attachment_3 ? asset('storage/'.$bid->attachment_3) : null,
                        ]),
                        'created_at' => $bid->created_at,
                        'bidder' => $bid->arsitek ? [
                            'id' => $bid->arsitek->id,
                            'name' => $bid->arsitek->nama ?? $bid->arsitek->user->name,
                            'phone' => $bid->arsitek->no_telp ?? $bid->arsitek->user->phoneNumber->first()?->contact,
                            'specialization' => $bid->arsitek->spesialisasi,
                            'experience_years' => $bid->arsitek->pengalaman_tahun,
                            'rate' => $bid->arsitek->rate_harga,
                            'location' => $bid->arsitek->lokasi,
                            'average_rating' => $bid->arsitek->average_rating,
                            'review_count' => $bid->arsitek->review_count,
                            'user' => [
                                'id' => $bid->arsitek->user->id,
                                'name' => $bid->arsitek->user->name,
                                'email' => $bid->arsitek->user->email,
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
                            $bid->attachment_1 ? asset('storage/'.$bid->attachment_1) : null,
                            $bid->attachment_2 ? asset('storage/'.$bid->attachment_2) : null,
                            $bid->attachment_3 ? asset('storage/'.$bid->attachment_3) : null,
                        ]),
                        'created_at' => $bid->created_at,
                        'kontraktor_id' => $bid->kontraktor_id,
                        'bidder' => $bid->kontraktor ? [
                            'id' => $bid->kontraktor->id,
                            'name' => $bid->kontraktor->nama ?? $bid->kontraktor->user->name,
                            'phone' => $bid->kontraktor->no_telp ?? $bid->kontraktor->user->phoneNumber->first()?->contact,
                            'location' => $bid->kontraktor->lokasi,
                            'average_rating' => $bid->kontraktor->average_rating,
                            'review_count' => $bid->kontraktor->review_count,
                            'user' => [
                                'id' => $bid->kontraktor->user->id,
                                'name' => $bid->kontraktor->user->name,
                                'email' => $bid->kontraktor->user->email,
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
                        'calculated_total' => $bid->calculated_total,
                        'fee_type' => $bid->fee_type,
                        'tax_estimate' => $bid->tax_estimate,
                        'selected_services' => $bid->selected_services,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'attachments' => array_filter([
                            $bid->attachment_1 ? asset('storage/'.$bid->attachment_1) : null,
                            $bid->attachment_2 ? asset('storage/'.$bid->attachment_2) : null,
                            $bid->attachment_3 ? asset('storage/'.$bid->attachment_3) : null,
                        ]),
                        'created_at' => $bid->created_at,
                        'notaris_id' => $bid->notaris_id,
                        'bidder' => $bid->notaris ? [
                            'id' => $bid->notaris->id,
                            'name' => $bid->notaris->nama ?? $bid->notaris->user->name,
                            'phone' => $bid->notaris->no_telp ?? $bid->notaris->user->phoneNumber->first()?->contact,
                            'specialization' => $bid->notaris->spesialisasi,
                            'location' => $bid->notaris->lokasi,
                            'average_rating' => $bid->notaris->average_rating,
                            'review_count' => $bid->notaris->review_count,
                            'user' => [
                                'id' => $bid->notaris->user->id,
                                'name' => $bid->notaris->user->name,
                                'email' => $bid->notaris->user->email,
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
                        'calculated_total' => $bid->calculated_total,
                        'fee_type' => $bid->fee_type,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'scopes' => $bid->scopes,
                        'deliverables' => $bid->deliverables,
                        'attachments' => array_filter([
                            $bid->attachment_1 ? asset('storage/'.$bid->attachment_1) : null,
                            $bid->attachment_2 ? asset('storage/'.$bid->attachment_2) : null,
                            $bid->attachment_3 ? asset('storage/'.$bid->attachment_3) : null,
                        ]),
                        'created_at' => $bid->created_at,
                        'interior_id' => $bid->interior_id,
                        'bidder' => $bid->interior ? [
                            'id' => $bid->interior->id,
                            'name' => $bid->interior->nama ?? $bid->interior->user->name,
                            'phone' => $bid->interior->no_telp ?? $bid->interior->user->phoneNumber->first()?->contact,
                            'location' => $bid->interior->lokasi,
                            'average_rating' => $bid->interior->average_rating,
                            'review_count' => $bid->interior->review_count,
                            'user' => [
                                'id' => $bid->interior->user->id,
                                'name' => $bid->interior->user->name,
                                'email' => $bid->interior->user->email,
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
                        'calculated_total' => $bid->calculated_total,
                        'fee_type' => $bid->fee_type,
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'scopes' => $bid->scopes,
                        'deliverables' => $bid->deliverables,
                        'pm_id' => $bid->pm_id,
                        'created_at' => $bid->created_at,
                        'pm' => $bid->pm ? [
                            'id' => $bid->pm->id,
                            'nama' => $bid->pm->nama ?? $bid->pm->user?->name ?? 'Unknown PM',
                            'verification_status' => $bid->pm->verification_status,
                            'pengalaman_tahun' => $bid->pm->pengalaman_tahun,
                            'user' => $bid->pm->user ? [
                                'id' => $bid->pm->user->id,
                                'name' => $bid->pm->user->name,
                                'email' => $bid->pm->user->email,
                            ] : null,
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
                        'content' => $milestone->content,
                        'approval_status' => $milestone->approval_status,
                        'phase_context' => $milestone->phase_context,
                        'start_date' => $milestone->start_date,
                        'due_date' => $milestone->due_date,
                        'is_completed' => (bool) $milestone->is_completed,
                        'arsitek_id' => $milestone->arsitek_id,
                        'kontraktor_id' => $milestone->kontraktor_id,
                        'notaris_id' => $milestone->notaris_id,
                        'interior_id' => $milestone->interior_id,
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
                    'notes' => $req->notes,
                    'image_url' => $req->image_path ? asset('storage/' . $req->image_path) : null,
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
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'scopes' => $bid->scopes,
                        'deliverables' => $bid->deliverables,
                        'attachments' => array_filter([
                            $bid->attachment_1 ? asset('storage/'.$bid->attachment_1) : null,
                            $bid->attachment_2 ? asset('storage/'.$bid->attachment_2) : null,
                            $bid->attachment_3 ? asset('storage/'.$bid->attachment_3) : null,
                        ]),
                        'created_at' => $bid->created_at,
                        'bidder' => $bid->structuralEngineer ? [
                            'id' => $bid->structuralEngineer->id,
                            'name' => $bid->structuralEngineer->nama ?? $bid->structuralEngineer->user->name,
                            'phone' => $bid->structuralEngineer->no_telp ?? $bid->structuralEngineer->user->phoneNumber->first()?->contact,
                            'specialization' => $bid->structuralEngineer->spesialisasi,
                            'experience_years' => $bid->structuralEngineer->pengalaman_tahun,
                            'rate' => $bid->structuralEngineer->rate_harga,
                            'location' => $bid->structuralEngineer->lokasi,
                            'user' => [
                                'id' => $bid->structuralEngineer->user->id,
                                'name' => $bid->structuralEngineer->user->name,
                                'email' => $bid->structuralEngineer->user->email,
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
                        'proposal' => $bid->proposal,
                        'status' => $bid->status,
                        'estimated_duration' => $bid->estimated_duration,
                        'duration_unit' => $bid->duration_unit,
                        'scopes' => $bid->scopes,
                        'deliverables' => $bid->deliverables,
                        'attachments' => array_filter([
                            $bid->attachment_1 ? asset('storage/'.$bid->attachment_1) : null,
                            $bid->attachment_2 ? asset('storage/'.$bid->attachment_2) : null,
                            $bid->attachment_3 ? asset('storage/'.$bid->attachment_3) : null,
                        ]),
                        'created_at' => $bid->created_at,
                        'bidder' => $bid->mepEngineer ? [
                            'id' => $bid->mepEngineer->id,
                            'name' => $bid->mepEngineer->nama ?? $bid->mepEngineer->user->name,
                            'phone' => $bid->mepEngineer->no_telp ?? $bid->mepEngineer->user->phoneNumber->first()?->contact,
                            'specialization' => $bid->mepEngineer->spesialisasi,
                            'experience_years' => $bid->mepEngineer->pengalaman_tahun,
                            'rate' => $bid->mepEngineer->rate_harga,
                            'location' => $bid->mepEngineer->lokasi,
                            'user' => [
                                'id' => $bid->mepEngineer->user->id,
                                'name' => $bid->mepEngineer->user->name,
                                'email' => $bid->mepEngineer->user->email,
                            ],
                        ] : null,
                    ];
                });
            }),
            'structural_engineer' => $this->whenLoaded('structuralEngineer', function () {
                return [
                    'id' => $this->structuralEngineer->id,
                    'name' => $this->structuralEngineer->nama,
                    'user' => [
                        'id' => $this->structuralEngineer->user->id,
                        'name' => $this->structuralEngineer->user->name,
                    ],
                ];
            }),
            'mep_engineer' => $this->whenLoaded('mepEngineer', function () {
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
                $bid = $this->bidsProjectManager->firstWhere('status', 'accepted');
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
                $bid = $this->bidsNotaris->firstWhere('status', 'accepted');
                if (!$bid) return null;
                return [
                    'id' => $bid->id,
                    'price' => $bid->price,
                    'tax_estimate' => $bid->tax_estimate,
                    'selected_services' => $bid->selected_services,
                    'proposal' => $bid->proposal,
                    'estimated_duration' => $bid->estimated_duration,
                    'duration_unit' => $bid->duration_unit,
                ];
            }),
            'accepted_arsitek_bid' => $this->whenLoaded('bidsArsitek', function () {
                $bid = $this->bidsArsitek->firstWhere('status', 'accepted');
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
                $bid = $this->bidsKontraktor->firstWhere('status', 'accepted');
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
            'accepted_interior_bid' => $this->whenLoaded('bidsInterior', function () {
                $bid = $this->bidsInterior->firstWhere('status', 'accepted');
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
            'payment_termins' => $this->paymentTermins->map(fn($t) => [
                'id' => $t->id,
                'label' => $t->label,
                'percentage' => $t->percentage,
                'amount' => $t->amount,
                'notes' => $t->notes,
                'status' => $t->status,
                'milestone_id' => $t->milestone_id,
                'milestone_title' => $t->milestone?->title,
                'role_type' => $t->role_type,
                'retention_amount' => (float) $t->retention_amount,
                'net_amount' => (float) $t->net_amount,
                'paid_at' => $t->paid_at,
            ]),
        ];
    }
}
