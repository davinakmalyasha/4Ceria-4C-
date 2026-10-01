<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Project extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'projects';

    protected static function booted(): void
    {
        static::saving(function (Project $project): void {
            $choices = $project->bidding_choices ?? [];
            $published = $project->published_bidding_roles ?? [];

            $roleMap = [
                'project_manager' => 'project_manager',
                'notaris' => 'notaris',
                'arsitek' => 'arsitek',
                'kontraktor' => 'kontraktor',
                'interior' => 'interior'
            ];

            foreach ($choices as $key => $value) {
                $role = $roleMap[$key] ?? null;
                if ($role && ($value === 'find' || ($role === 'notaris' && $value === 'cert_only')) && !in_array($role, $published)) {
                    $published[] = $role;
                }
            }

            $project->published_bidding_roles = $published;
        });
    }

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
        'requires_interior',
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
        'walkthrough_status',
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
        'latitude' => 'float',
        'longitude' => 'float',
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
        'requires_interior' => 'boolean',
        'wants_to_discuss_later' => 'boolean',
        'design_locked_at' => 'datetime',
        'construction_locked_at' => 'datetime',
        'interior_locked_at' => 'datetime',
        'planning_submitted_at' => 'datetime',
        'planning_approved_at' => 'datetime',
        'design_payment_verified_at' => 'datetime',
        'materials_authorized_at' => 'datetime',
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

    /**
     * Procurement requests raised against this project's BOM.
     *
     * MISSING, and the code that needs it has been failing:
     *
     *     $project->procurementRequests()->create([...])
     *
     * in `ProjectRequirementController::requestProcurement()` -- which raises the
     * "Call to undefined method App\Models\Project::procurementRequests()" 500.
     *
     * That path was UNREACHABLE until now, because the same method gated it on
     *
     *     ->where('status', 'hired')
     *
     * and `hired` is not a member of the `project_sub_professionals.status` enum,
     * so `$isSubContractor` was permanently false. Fixing the enum value is what
     * exposed this second, latent 500 underneath -- which is worth recording,
     * because it means a sub-contractor had never successfully requested
     * procurement and the whole flow had never been executed once.
     *
     * `hasMany` with an explicit key rather than the bare `project_id`
     * convention, so it cannot silently break if the FK name changes.
     */
    public function procurementRequests()
    {
        return $this->hasMany(ProjectProcurementRequest::class, 'project_id');
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

    public function materialFolders()
    {
        return $this->hasMany(ProjectMaterialFolder::class);
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

    public function disputes()
    {
        return $this->hasMany(ProjectDispute::class)->orderBy('created_at', 'desc');
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
     * Canonical financial state for this project.
     *
     * The arithmetic itself lives in ProjectFinancialService (the single
     * source of truth shared with the write-path guard). It previously lived
     * here and was derived from BIDS + approved addendums + change orders,
     * which disagreed with the enforcement rule in deductBudget
     * (`budget - SUM(payment rows)`): a termin paid through the ledger was
     * invisible here, while a `contract_pending` bid that was never paid was
     * counted. The owner was therefore told one number while the server
     * enforced another.
     *
     * Cache key uses MILLISECOND precision plus the newest ledger row, so two
     * writes in the same second cannot serve a stale summary.
     */
    public function calculateBudgetSummary(): array
    {
        $ledgerTouch = \App\Models\ProjectBudgetTransaction::where('project_id', $this->id)
            ->max('updated_at');

        $key = 'budget_summary_'.$this->id.'_'
            .optional($this->updated_at)->getTimestampMs()
            .'_'.optional($ledgerTouch)->getTimestampMs();

        return \Illuminate\Support\Facades\Cache::remember($key, 60, function () {
            return $this->doCalculateBudgetSummary();
        });
    }

    private function doCalculateBudgetSummary(): array
    {
        return app(\App\Services\ProjectFinancialService::class)->summary($this);
    }
}
