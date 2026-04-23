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
    ];

    protected $casts = [
        'needed_phases' => 'array',
        'completed_phases' => 'array',
        'design_details' => 'array',
        'construction_details' => 'array',
        'interior_details' => 'array',
        'project_dimensions' => 'array',
        'legal_requirements' => 'array',
        'published_bidding_roles' => 'array',
        'wants_project_manager' => 'boolean',
        'requires_structural' => 'boolean',
        'requires_mep' => 'boolean',
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
}
