<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NotificationPreference;
use App\Services\NotificationPreferenceService;
use Illuminate\Http\Request;

class NotificationPreferenceController extends Controller
{
    public function __construct(private NotificationPreferenceService $service)
    {
    }

    public function index()
    {
        return response()->json($this->service->forUser(request()->user()));
    }

    /**
     * Upsert one preference row.
     *
     * `type: null` = the blanket default for a channel; a concrete type
     * overrides it. Non-muteable types are rejected here too, so a client
     * cannot disable arbitration or payment notifications.
     */
    public function update(Request $request)
    {
        $data = $request->validate([
            'type' => 'nullable|string|max:60',
            'channel' => 'required|in:'.implode(',', NotificationPreferenceService::CHANNELS),
            'enabled' => 'required|boolean',
            'digest' => 'nullable|in:none,daily,weekly',
            'quiet_hours_start' => 'nullable|date_format:H:i',
            'quiet_hours_end' => 'nullable|date_format:H:i',
        ]);

        if (! empty($data['type']) && in_array($data['type'], NotificationPreferenceService::ALWAYS_ON, true)) {
            return response()->json([
                'message' => "Notifications of type '{$data['type']}' cover money movement or arbitration and cannot be disabled.",
            ], 422);
        }

        $preference = NotificationPreference::updateOrCreate(
            [
                'user_id' => $request->user()->id,
                'type' => $data['type'] ?? null,
                'channel' => $data['channel'],
            ],
            [
                'enabled' => $data['enabled'],
                'digest' => $data['digest'] ?? 'none',
                'quiet_hours_start' => $data['quiet_hours_start'] ?? null,
                'quiet_hours_end' => $data['quiet_hours_end'] ?? null,
            ]
        );

        return response()->json([
            'message' => 'Notification preference saved.',
            'data' => $preference,
        ]);
    }

    /**
     * Remove a preference (falls back to the platform default).
     */
    public function destroy(Request $request)
    {
        $request->validate([
            'type' => 'nullable|string|max:60',
            'channel' => 'required|in:'.implode(',', NotificationPreferenceService::CHANNELS),
        ]);

        NotificationPreference::where('user_id', $request->user()->id)
            ->where('channel', $request->channel)
            ->where(fn ($q) => $request->filled('type')
                ? $q->where('type', $request->type)
                : $q->whereNull('type'))
            ->delete();

        return response()->json(['message' => 'Preference reset to default.']);
    }
}
