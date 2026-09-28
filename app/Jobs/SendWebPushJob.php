<?php

namespace App\Jobs;

use App\Models\Notification;
use App\Models\PushSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/**
 * Fans a single in-app notification out to every Web Push subscription
 * of its recipient. Registered once on Notification::created — the 48
 * Notification::create() call sites stay untouched.
 */
class SendWebPushJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 5;

    public function __construct(public int $notificationId)
    {
        // Queueable already declares $afterCommit (untyped) — assign it
        // here instead of redeclaring, or PHP composition fatals.
        $this->afterCommit = true;
    }

    public function handle(): void
    {
        $publicKey = config('webpush.public_key');
        $privateKey = config('webpush.private_key');

        if (! $publicKey || ! $privateKey) {
            return;
        }

        $notification = Notification::find($this->notificationId);

        if (! $notification || ! $notification->user_id) {
            return;
        }

        $userId = $notification->user_id;

        // Rate cap: at most one push per user per 5s so chat_message
        // floods collapse instead of hammering the push service.
        try {
            if (! Cache::add('webpush:rate:'.$userId, 1, 5)) {
                return;
            }
        } catch (\Throwable) {
            // Cache unavailable — send anyway rather than fail the job.
        }

        $subscriptions = PushSubscription::where('user_id', $userId)->get();

        if ($subscriptions->isEmpty()) {
            return;
        }

        $payload = json_encode([
            'title' => $notification->title,
            'body' => $notification->body,
            'type' => $notification->type,
            'data' => $notification->data,
            'url' => $this->resolveUrl($notification),
            'notification_id' => $notification->id,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        try {
            $webPush = new WebPush([
                'VAPID' => [
                    'subject' => config('webpush.subject'),
                    'publicKey' => $publicKey,
                    'privateKey' => $privateKey,
                ],
            ], [
                'TTL' => 60 * 60 * 24,
                'urgency' => 'normal',
            ]);

            foreach ($subscriptions as $row) {
                $subscription = new Subscription(
                    $row->endpoint,
                    $row->p256dh,
                    $row->auth,
                    $row->content_encoding,
                );

                $report = $webPush->sendOneNotification($subscription, $payload);

                if ($report->isSubscriptionExpired()) {
                    // 404/410: browser rotation or uninstall — prune it.
                    $row->delete();
                } elseif (! $report->isSuccess()) {
                    Log::warning('Web push delivery failed', [
                        'notification_id' => $this->notificationId,
                        'user_id' => $userId,
                        'reason' => $report->getReason(),
                    ]);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Web push dispatch error: '.$e->getMessage(), [
                'notification_id' => $this->notificationId,
            ]);
        }
    }

    /**
     * Deep link for notificationclick — mirrors the dropdown's routing
     * (chat sender / project detail / invitations) via ?tab= params.
     */
    private function resolveUrl(Notification $notification): string
    {
        $data = $notification->data ?? [];

        if ($notification->type === 'chat_message' && ! empty($data['sender_id'])) {
            return '/dashboard?tab=chat&chat_user='.(int) $data['sender_id'];
        }

        if (! empty($data['project_id'])) {
            return '/dashboard?tab=project-detail&project='.(int) $data['project_id'];
        }

        if ($notification->type === 'project_invitation') {
            return '/dashboard?tab=my-bids';
        }

        return '/dashboard?tab=overview';
    }
}
