<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProfessionalPortfolio extends Model
{
    protected $table = 'professional_portfolios';

    protected $fillable = [
        'user_id',
        'role_type',
        'title',
        'description',
        'image_path',
        'duration',
        'client_review'
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
