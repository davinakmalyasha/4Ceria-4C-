<?php

namespace App\Models;

use Laravel\Sanctum\PersonalAccessToken as SanctumPersonalAccessToken;

class PersonalAccessToken extends SanctumPersonalAccessToken
{
    /**
     * Limit the rate at which the token's last_used_at timestamp is updated in the database.
     */
    protected static function booted()
    {
        parent::booted();

        static::updating(function ($token) {
            if ($token->isDirty('last_used_at')) {
                $original = $token->getOriginal('last_used_at');
                if ($original && now()->parse($original)->diffInMinutes(now()) < 5) {
                    $token->last_used_at = $original;
                }
            }
        });
    }
}
