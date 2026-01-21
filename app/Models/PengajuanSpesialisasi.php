<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PengajuanSpesialisasi extends Model
{
    protected $table = 'pengajuan_spesialisasi';
    protected $fillable = [
        'kontraktor_id',
        'spesialisasi_id',
        'file_sertifikat',
        'catatan',
        'status',
    ];

    public function kontraktor()
    {
        return $this->belongsTo(Kontraktor::class);
    }

    public function spesialisasi()
    {
        return $this->belongsTo(Spesialisasi::class);
    }
}
