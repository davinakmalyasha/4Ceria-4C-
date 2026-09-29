<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\ClearsProfessionalCache;

class MepEngineer extends Model
{
    use HasFactory, ClearsProfessionalCache;

    protected $table = 'mep_engineers';

    protected $fillable = [
        'user_id',
        'nama',
        'no_telp',
        'rate_harga',
        'spesialisasi',
        'deskripsi',
        'lokasi',
        'pengalaman_tahun',
        'file_portofolio',
        'file_sertifikat',
        'pendidikan',
        'alasan_hire',
        'verification_status',
        'rejection_reason',
        'foto',
        'entity_type',
        'company_name',
        'company_license',
        'identity_number',
        'npwp_number',
        'siup_number',
        'npwp',
        'siup',
    ];

    /**
     * Money is a fixed-point string; coordinates and ratios are floats.
     * See App\Support\Money for why the two are cast differently.
     */
    protected $casts = [
        'rate_harga' => 'decimal:2',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
