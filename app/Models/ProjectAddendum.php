<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectAddendum extends Model
{
    use HasFactory;

    protected $table = 'project_addendums';

    protected $fillable = [
        'project_id',
        'role_type',
        'user_id',
        'title',
        'description',
        'amount',
        'status',
        'recommended_bid_id',
        'recommended_bid_type',
        'procurement_request_id',
        'paid_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'paid_at' => 'datetime',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function procurementRequest()
    {
        return $this->belongsTo(ProjectProcurementRequest::class, 'procurement_request_id');
    }
}
