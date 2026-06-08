<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChatMessage extends Model
{
    protected $fillable = ['conversation_id', 'sender_id', 'content', 'image', 'is_read'];

    protected $casts = [
        'is_read' => 'boolean',
    ];

    protected $appends = ['image_url'];

    public function getImageUrlAttribute()
    {
        if (!$this->image) {
            return null;
        }
        try {
            return \Illuminate\Support\Facades\Storage::disk('public')->temporaryUrl($this->image, now()->addHours(24));
        } catch (\Throwable $e) {
            return \Illuminate\Support\Facades\Storage::disk('public')->url($this->image);
        }
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class, 'conversation_id');
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }
}
