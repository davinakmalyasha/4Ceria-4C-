<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Project extends Model
{
    use HasFactory;

    protected $table = 'projects';

    protected $fillable = [
        'user_id',
        'title',
        'description',
        'budget',
        'lokasi',
        'jenis_proyek',
        'owner_id',
        'selected_arsitek_id',
        'selected_kontraktor_id',
        'selected_notaris_id',
        'selected_interior_id',
        'pm_id',
        'status',
        'structural_id',
        'mep_id',
        'wants_project_manager',
        'requires_structural',
        'requires_mep',
        'design_completed_at',
        'deadline',
        'attachment',
        'target_role',
        'needed_phases',
        'latitude',
        'longitude',
        'province',
        'city',
        'kecamatan',
        'kelurahan',
        'postal_code',
        'street_name',
        'design_details',
        'completed_phases',
        'design_completed_at',
        'design_locked_at',
        'construction_details',
        'construction_completed_at',
        'construction_locked_at',
        'interior_details',
        'interior_locked_at',
        'interior_completed_at',
        'share_token',
        'requires_mep',
        'planning_status',
        'negotiated_fee',
        'payment_instructions',
        'planning_submitted_at',
        'planning_approved_at',
        'design_payment_verified_at',
        'construction_payment_verified_at',
        'interior_payment_verified_at',
        'pm_audit_notes',
        'pm_audit_attachments',
        'architect_notes',
        'planning_iteration',
        'project_category',
        'project_dimensions',
        'legal_requirements',
        'published_bidding_roles',
        'legal_completed_at',
        'legal_locked_at',
        'structural_approved_at',
        'mep_approved_at',
        'pbg_verified_at',
        'slf_verified_at',
        'construction_brief_status',
        'construction_brief_revision_notes',
        'design_handover_submitted_at',
        'design_handover_notes',
        'construction_handover_submitted_at',
        'construction_handover_notes',
        'interior_handover_submitted_at',
        'interior_handover_notes',
        'legal_handover_submitted_at',
        'legal_handover_notes',
        'final_walkthrough_at',
        'owner_accepted_at',
        'owner_acceptance_notes',
        'owner_design_approved_at',
        'owner_build_approved_at',
        'owner_interior_approved_at',
        'owner_legal_approved_at',
        'warranty_start_at',
        'warranty_end_at',
        'legal_detail',
        'wants_to_discuss_later',
        'bidding_choices',
        'arsitek_kickoff_at',
        'kontraktor_kickoff_at',
    ];

    protected $casts = [
        'budget' => 'decimal:2',
        'needed_phases' => 'array',
        'completed_phases' => 'array',
        'design_details' => 'array',
        'construction_details' => 'array',
        'interior_details' => 'array',
        'project_dimensions' => 'array',
        'legal_requirements' => 'array',
        'published_bidding_roles' => 'array',
        'bidding_choices' => 'array',
        'wants_project_manager' => 'boolean',
        'requires_structural' => 'boolean',
        'requires_mep' => 'boolean',
        'wants_to_discuss_later' => 'boolean',
        'design_locked_at' => 'datetime',
        'construction_locked_at' => 'datetime',
        'interior_locked_at' => 'datetime',
        'planning_submitted_at' => 'datetime',
        'planning_approved_at' => 'datetime',
        'design_payment_verified_at' => 'datetime',
        'pm_audit_notes' => 'string',
        'pm_audit_attachments' => 'array',
        'architect_notes' => 'string',
        'planning_iteration' => 'integer',
        'negotiated_fee' => 'decimal:2',
        'legal_completed_at' => 'datetime',
        'legal_locked_at' => 'datetime',
        'structural_approved_at' => 'datetime',
        'mep_approved_at' => 'datetime',
        'pbg_verified_at' => 'datetime',
        'slf_verified_at' => 'datetime',
        'design_handover_submitted_at' => 'datetime',
        'construction_handover_submitted_at' => 'datetime',
        'interior_handover_submitted_at' => 'datetime',
        'legal_handover_submitted_at' => 'datetime',
        'final_walkthrough_at' => 'datetime',
        'owner_accepted_at' => 'datetime',
        'owner_design_approved_at' => 'datetime',
        'owner_build_approved_at' => 'datetime',
        'owner_interior_approved_at' => 'datetime',
        'owner_legal_approved_at' => 'datetime',
        'warranty_start_at' => 'datetime',
        'warranty_end_at' => 'datetime',
        'arsitek_kickoff_at' => 'datetime',
        'kontraktor_kickoff_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function externalVendors()
    {
        return $this->hasMany(ProjectExternalVendor::class);
    }

    public function arsitek()
    {
        return $this->belongsTo(Arsitek::class, 'selected_arsitek_id');
    }

    public function kontraktor()
    {
        return $this->belongsTo(Kontraktor::class, 'selected_kontraktor_id');
    }

    public function reports()
    {
        return $this->hasMany(ProjectReport::class);
    }

    public function bidsArsitek()
    {
        return $this->hasMany(BidArsitek::class, 'project_id');
    }

    public function bidsKontraktor()
    {
        return $this->hasMany(BidKontraktor::class);
    }

    public function bidsStructural()
    {
        return $this->hasMany(\App\Models\BidStructural::class, 'project_id');
    }

    public function selectedArsitek()
    {
        return $this->belongsTo(User::class, 'selected_arsitek_id');
    }

    public function ratings()
    {
        return $this->hasMany(ArsitekRating::class);
    }

    public function kontraktorRating()
    {
        return $this->hasOne(\App\Models\KontraktorRating::class, 'project_id', 'id');
    }

    public function images()
    {
        return $this->hasMany(ProjectImage::class)->orderBy('sort_order');
    }

    public function milestones()
    {
        return $this->hasMany(ProjectMilestone::class);
    }

    public function comments()
    {
        return $this->hasMany(ProjectComment::class)->orderBy('created_at', 'asc');
    }

    public function documents()
    {
        return $this->hasMany(ProjectDocument::class)->orderBy('created_at', 'desc');
    }

    public function activityLogs()
    {
        return $this->hasMany(ProjectActivityLog::class)->orderBy('created_at', 'desc');
    }

    public function requirements()
    {
        return $this->hasMany(ProjectRequirement::class);
    }

    public function dailyLogs()
    {
        return $this->hasMany(ProjectDailyLog::class)->orderBy('log_date', 'desc');
    }

    public function paymentTermins()
    {
        return $this->hasMany(ProjectPaymentTermin::class)->orderBy('id', 'asc');
    }

    public function materialOrders()
    {
        return $this->hasMany(MaterialOrder::class);
    }

    public function notaris()
    {
        return $this->belongsTo(NotarisProfile::class, 'selected_notaris_id');
    }

    public function interior()
    {
        return $this->belongsTo(InteriorProfile::class, 'selected_interior_id');
    }

    public function bidsNotaris()
    {
        return $this->hasMany(BidNotaris::class, 'project_id');
    }

    public function bidsInterior()
    {
        return $this->hasMany(BidInterior::class, 'project_id');
    }

    public function bidsProjectManager()
    {
        return $this->hasMany(BidProjectManager::class, 'project_id');
    }

    public function budgetTransactions()
    {
        return $this->hasMany(ProjectBudgetTransaction::class)->orderBy('transaction_date', 'desc');
    }

    public function budgetSandboxItems()
    {
        return $this->hasMany(ProjectBudgetSandbox::class)->orderBy('created_at', 'asc');
    }

    public function addendums()
    {
        return $this->hasMany(ProjectAddendum::class)->orderBy('created_at', 'desc');
    }

    public function projectManager()
    {
        return $this->belongsTo(ProjectManager::class, 'pm_id', 'user_id');
    }

    public function structuralEngineer()
    {
        return $this->belongsTo(StructuralEngineer::class, 'structural_id');
    }

    public function mepEngineer()
    {
        return $this->belongsTo(MepEngineer::class, 'mep_id');
    }

    public function bidsMep()
    {
        return $this->hasMany(BidMep::class, 'project_id');
    }

    public function snagItems()
    {
        return $this->hasMany(ProjectSnagItem::class)->orderBy('created_at', 'desc');
    }

    public function changeOrders()
    {
        return $this->hasMany(ProjectChangeOrder::class)->orderBy('created_at', 'desc');
    }

    public function warrantyClaims()
    {
        return $this->hasMany(ProjectWarrantyClaim::class)->orderBy('created_at', 'desc');
    }

    public function timelineExtensions()
    {
        return $this->hasMany(ProjectTimelineExtension::class)->orderBy('created_at', 'desc');
    }

    public function schedules()
    {
        return $this->hasMany(ProjectSchedule::class);
    }

    public function delays()
    {
        return $this->hasMany(ProjectDelay::class);
    }

    public function subProfessionals()
    {
        return $this->hasMany(ProjectSubProfessional::class);
    }

    public function stickyNotes()
    {
        return $this->hasMany(StickyNote::class);
    }

    /**
     * Calculate the current financial state of the project.
     * Allocated = Sum of hired professionals + approved addendums + approved change orders.
     */
    public function calculateBudgetSummary(): array
    {
        $hiredStatuses = ['accepted', 'awaiting_payment', 'active', 'contract_pending', 'completed'];
        
        $allocated = 0;
        
        // Sum all accepted/active professional bids
        $allocated += $this->bidsArsitek()->whereIn('status', $hiredStatuses)->sum('calculated_total') ?: $this->bidsArsitek()->whereIn('status', $hiredStatuses)->sum('price');
        $allocated += $this->bidsKontraktor()->whereIn('status', $hiredStatuses)->sum('calculated_total') ?: $this->bidsKontraktor()->whereIn('status', $hiredStatuses)->sum('price');
        $allocated += $this->bidsNotaris()->whereIn('status', $hiredStatuses)->sum('calculated_total') ?: $this->bidsNotaris()->whereIn('status', $hiredStatuses)->sum('price');
        $allocated += $this->bidsInterior()->whereIn('status', $hiredStatuses)->sum('calculated_total') ?: $this->bidsInterior()->whereIn('status', $hiredStatuses)->sum('price');
        $allocated += $this->bidsProjectManager()->whereIn('status', $hiredStatuses)->sum('calculated_total') ?: $this->bidsProjectManager()->whereIn('status', $hiredStatuses)->sum('price');
        $allocated += $this->bidsStructural()->whereIn('status', $hiredStatuses)->sum('calculated_total') ?: $this->bidsStructural()->whereIn('status', $hiredStatuses)->sum('price');
        $allocated += $this->bidsMep()->whereIn('status', $hiredStatuses)->sum('calculated_total') ?: $this->bidsMep()->whereIn('status', $hiredStatuses)->sum('price');
        
        // Addendums (Professional extra fees / Material authorizations)
        // CRITICAL FIX: Only count PAID or APPROVED (pm_reviewed) addendums as allocated.
        // approved_unpaid is just a reservation, it shouldn't show as "gone" yet if the user is confused.
        $allocated += $this->addendums()->whereIn('status', ['paid', 'approved', 'pm_reviewed'])->sum('amount');

        
        // Change Orders
        $allocated += $this->changeOrders()->where('status', 'owner_approved')->sum('cost_impact');

        $totalBudget = (float) $this->budget;
        
        return [
            'total' => $totalBudget,
            'allocated' => (float) $allocated,
            'remaining' => (float) ($totalBudget - $allocated),
            'percent_used' => $totalBudget > 0 ? ($allocated / $totalBudget) * 100 : 0
        ];
    }
}
