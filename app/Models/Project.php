<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;


class Project extends Model
{
    use HasFactory;
    protected $table = 'projects'; 

    protected $fillable = [
        'user_id',
        'title',
        'description',
        'budget',
        'lokasi',
        'jenis_proyek',
        'status',
        'selected_arsitek_id',
        'deadline',         
        'attachment',      
    ];
    

    public function user()
    {
        return $this->belongsTo(User::class);
    }
    public function arsitek()
{
    return $this->belongsTo(Arsitek::class, 'selected_arsitek_id');
}

public function kontraktor()
{
    return $this->belongsTo(Kontraktor::class, 'selected_kontraktor_id');
}

    public function bidsArsitek()
    {
        return $this->hasMany(BidArsitek::class, 'project_id');
    }

    public function bidsKontraktor()
    {
        return $this->hasMany(BidKontraktor::class);
    }

    public function selectedArsitek()
    {
        return $this->belongsTo(User::class, 'selected_arsitek_id');
    }
    public function ratings()
{
    return $this->hasMany(ArsitekRating::class);
}
public function kontraktorRating()
{
    return $this->hasOne(\App\Models\KontraktorRating::class, 'project_id', 'id');
}

}
