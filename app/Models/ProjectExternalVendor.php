<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectExternalVendor extends Model
{
    protected $fillable = [
        'project_id',
        'team_member_id',
        'phase_role',
        'company_name',
        'contact_person',
        'phone_number',
        'email',
        'agreed_fee',
        'notes',
    ];

    /**
     * `agreed_fee` is a fixed-point string, never a float. It is written by
     * ProjectPhaseService through ProjectFinancialService::deductBudget(), so
     * the cast has to survive the write-then-read round trip intact.
     */
    protected $casts = [
        'agreed_fee' => 'decimal:2',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function teamMember()
    {
        return $this->belongsTo(TeamMember::class);
    }
}
