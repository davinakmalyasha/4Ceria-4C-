<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ContractorSubspecialty extends Model
{
    use HasFactory;

    protected $table = 'contractor_subspecialties';

    protected $fillable = [
        'slug',
        'label',
        'label_id',
        'category',
        'icon',
    ];
}
