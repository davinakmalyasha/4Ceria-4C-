<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectExternalVendor extends Model
{
    protected $fillable = [
        'project_id',
        'phase_role',
        'company_name',
        'contact_person',
        'phone_number',
        'email',
        'agreed_fee',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
