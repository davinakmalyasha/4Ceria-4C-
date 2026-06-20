<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\ClearsProfessionalCache;

class TeamMember extends Model
{
    use HasFactory, ClearsProfessionalCache;

    protected $table = 'team_members';

    protected $fillable = [
        'owner_user_id',
        'owner_role',
        'name',
        'photo_path',
        'role_title',
        'bio',
        'skills',
        'phone',
        'email',
        'status',
    ];

    protected $casts = [
        'skills' => 'array',
    ];

    protected $appends = ['photo_url'];

    /* ─── Relations ──── */

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    /* ─── Scopes ──── */

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /* ─── Accessors ──── */

    public function getPhotoUrlAttribute(): ?string
    {
        if (!$this->photo_path) {
            return null;
        }

        return str_starts_with($this->photo_path, 'http')
            ? $this->photo_path
            : '/storage/' . $this->photo_path;
    }
}
