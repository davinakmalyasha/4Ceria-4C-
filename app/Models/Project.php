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
        'selected_kontraktor_id',
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

public function images()
{
    return $this->hasMany(ProjectImage::class)->orderBy('sort_order');
}

public function milestones()
{
    return $this->hasMany(ProjectMilestone::class);
}

public function comments()
{
    return $this->hasMany(ProjectComment::class)->orderBy('created_at', 'asc');
}

public function documents()
{
    return $this->hasMany(ProjectDocument::class)->orderBy('created_at', 'desc');
}

public function activityLogs()
{
    return $this->hasMany(ProjectActivityLog::class)->orderBy('created_at', 'desc');
}

}
