<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MepEngineer extends Model
{
    use HasFactory;

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
        'verification_status',
        'rejection_reason',
        'foto',
        'entity_type',
        'company_name',
        'company_license',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
