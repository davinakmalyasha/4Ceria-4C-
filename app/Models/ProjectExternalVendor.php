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

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function teamMember()
    {
        return $this->belongsTo(TeamMember::class);
    }
}
