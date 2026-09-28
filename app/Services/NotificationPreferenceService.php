<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\User;

/**
 * Notification fan-out policy.
 *
 * Enforced at the ONE place every notification passes through
 * (`Notification::created` in AppServiceProvider), so no individual create
 * site can forget it.
 *
 * DESIGN RULE — money and arbitration are NOT muteable:
 *   If a user can silence "your payment was released" or "a dispute is open
 *   and your money is frozen", the freeze and the escrow stop being
 *   trustworthy. Those types always deliver.
 */
class NotificationPreferenceService
{
    public const CHANNELS = ['inapp', 'webpush', 'email', 'whatsapp'];

    /**
     * Types that always notify, regardless of user preference. Muteable
     * anything is a notification type NOT listed here.
     */
    public const ALWAYS_ON = [
        // Arbitration — the whole point is that the parties know.
        'dispute_opened', 'dispute_reply', 'dispute_resolved',
        // Money movement.
        'payment_verified', 'payment_rejected', 'payment_disputed',
        // Invitations & contract state.
        'project_invitation', 'bid_accepted', 'pm_hire_initiated',
        'contract_terminated', 'professional_resigned',
        // Compliance / safety gates the platform itself depends on.
        'warranty_claim', 'snag_overdue',
    ];

    /**
     * Should a push be sent for this notification?
     *
     * The in-app row is ALWAYS created; this only governs the extra push
     * fan-out, so muting never hides something from the notification centre.
     */
    public function shouldPush(Notification $notification): bool
    {
        $userId = (int) $notification->user_id;

        if ($userId <= 0) {
            return false;
        }

        if (in_array($notification->type, self::ALWAYS_ON, true)) {
            return true;
        }

        try {
            // A type-specific rule wins over the blanket default.
            $typeRule = NotificationPreference::where('user_id', $userId)
                ->where('channel', 'webpush')
                ->where('type', $notification->type)
                ->first();

            if ($typeRule) {
                return (bool) $typeRule->enabled && ! $this->inQuietHours($typeRule);
            }

            $default = NotificationPreference::where('user_id', $userId)
                ->where('channel', 'webpush')
                ->whereNull('type')
                ->first();

            if ($default && ! $default->enabled) {
                return false;
            }

            if ($default && $this->inQuietHours($default)) {
                return false;
            }

            return true;
        } catch (\Throwable) {
            // Never let a preference read break notification delivery.
            return true;
        }
    }

    /**
     * Quiet hours, honouring windows that wrap past midnight.
     */
    private function inQuietHours(NotificationPreference $preference): bool
    {
        if (! $preference->quiet_hours_start || ! $preference->quiet_hours_end) {
            return false;
        }

        $now = now()->format('H:i:s');
        $start = $preference->quiet_hours_start->format('H:i:s');
        $end = $preference->quiet_hours_end->format('H:i:s');

        if ($start <= $end) {
            return $now >= $start && $now < $end;
        }

        // wraps midnight (e.g. 22:00 → 06:00)
        return $now >= $start || $now < $end;
    }

    /**
     * Every preference row for a user, plus the non-muteable markers the UI
     * needs to disable its toggles.
     */
    public function forUser(User $user): array
    {
        $prefs = NotificationPreference::where('user_id', $user->id)
            ->orderBy('type')
            ->get();

        $grouped = [];

        foreach ($prefs as $pref) {
            $grouped[$pref->type ?? '*'][$pref->channel] = [
                'enabled' => (bool) $pref->enabled,
                'digest' => $pref->digest,
                'quiet_hours_start' => $pref->quiet_hours_start?->format('H:i'),
                'quiet_hours_end' => $pref->quiet_hours_end?->format('H:i'),
            ];
        }

        return [
            'preferences' => $grouped,
            'always_on' => self::ALWAYS_ON,
            'channels' => self::CHANNELS,
        ];
    }
}
