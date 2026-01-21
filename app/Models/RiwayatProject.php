<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiwayatProject extends Model
{
    protected $table = 'riwayat_projects';
    protected $fillable = ['project_id', 'arsitek_id', 'kontraktor_id','user_id', 'selesai_pada', 'keterangan'];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

  
public function arsitek()
{
    return $this->belongsTo(Arsitek::class, 'arsitek_id');
}

public function kontraktor()
{
    return $this->belongsTo(Kontraktor::class, 'kontraktor_id');
}


    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function rating()
    {
         return $this->hasOne(ArsitekRating::class, 'project_id', 'project_id');
    }


public function arsitekRating()
{
    return $this->hasOne(ArsitekRating::class, 'project_id', 'project_id');
}

public function kontraktorRating()
{
    return $this->hasOne(KontraktorRating::class, 'project_id', 'project_id');
}

}

