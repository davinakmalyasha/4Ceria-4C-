<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\NotarisConsultation;
use App\Models\NotarisProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ConsultationController extends Controller
{
    /**
     * Book a consultation with a notary.
     *
     * BUGFIX: the SPA's ConsultationModal has always POSTed /consultations, but
     * the controller was deleted in an earlier cleanup — the booking button
     * silently 404'd. This restores the endpoint against the existing
     * notaris_consultations table (model + schema never left).
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'notaris_id' => 'required|integer|exists:notaris_profiles,id',
            // FE sends a naive datetime-local string in WIB wall-clock; parse
            // it AS Asia/Jakarta then convert, so UTC-stored comparisons
            // (after:now) aren't skewed by the +7h offset.
            'schedule_date' => [
                'required',
                'string',
                function ($attribute, $value, $fail) {
                    try {
                        $dt = \Carbon\Carbon::parse($value, 'Asia/Jakarta');
                    } catch (\Throwable $e) {
                        $fail('The schedule date is not a valid datetime.');
                        return;
                    }
                    if ($dt->utc()->isPast()) {
                        $fail('The schedule date must be a datetime in the future.');
                    }
                },
            ],
            'notes' => 'nullable|string|max:2000',
        ]);

        $user = Auth::user();
        $notary = NotarisProfile::with('user')->find($validated['notaris_id']);

        if (!$notary || !$notary->user) {
            return response()->json(['message' => 'Notary not found.'], 404);
        }

        // Anti-flood cap: max 5 pending bookings per user per day.
        $dailyBookings = NotarisConsultation::where('user_id', $user->id)
            ->where('status', 'pending')
            ->where('created_at', '>=', now()->subDay())
            ->count();
        if ($dailyBookings >= 5) {
            return response()->json(['message' => 'You have too many pending consultation requests. Please wait for confirmations.'], 429);
        }

        // Prevent duplicate pending bookings for the same slot.
        $scheduleDate = \Carbon\Carbon::parse($validated['schedule_date'], 'Asia/Jakarta')
            ->timezone(config('app.timezone'));
        $existing = NotarisConsultation::where('notaris_id', $notary->id)
            ->where('user_id', $user->id)
            ->where('schedule_date', $scheduleDate)
            ->whereIn('status', ['pending', 'confirmed'])
            ->exists();

        if ($existing) {
            return response()->json(['message' => 'You already have a consultation booked for this time.'], 422);
        }

        $consultation = NotarisConsultation::create([
            'notaris_id' => $notary->id,
            'user_id' => $user->id,
            'schedule_date' => $scheduleDate,
            'status' => 'pending',
            'notes' => $validated['notes'] ?? null,
        ]);

        Notification::create([
            'user_id' => $notary->user_id,
            'type' => 'consultation_requested',
            'title' => 'New Consultation Booking',
            'body' => "{$user->name} requested a consultation on " .
                $scheduleDate->copy()->timezone('Asia/Jakarta')->format('d M Y H:i') . ' WIB.',
            'data' => [
                'consultation_id' => $consultation->id,
                'notaris_id' => $notary->id,
            ],
        ]);

        return response()->json([
            'message' => 'Consultation booked successfully.',
            'data' => $consultation,
        ], 201);
    }

    /**
     * List the current user's consultations (as client or as notary).
     */
    public function index(Request $request)
    {
        $user = Auth::user();

        $consultations = NotarisConsultation::with(['notaris.user', 'user'])
            ->where(function ($q) use ($user) {
                $q->where('user_id', $user->id)
                  ->orWhereHas('notaris', fn ($nq) => $nq->where('user_id', $user->id));
            })
            ->orderBy('schedule_date')
            ->get();

        return response()->json(['data' => $consultations]);
    }

    /**
     * Notary lifecycle actions on a booking. Completing the loop the
     * ConsultationModal always promised ("you will be notified once the
     * schedule is confirmed").
     */
    public function respond(Request $request, NotarisConsultation $consultation)
    {
        $user = Auth::user();
        if (!$consultation->notaris || (int) $consultation->notaris->user_id !== (int) $user->id) {
            return response()->json(['message' => 'Only the booked notary can manage this consultation.'], 403);
        }

        $validated = $request->validate([
            'action' => 'required|in:confirm,reject,reschedule,complete',
            'schedule_date' => [
                'required_if:action,reschedule',
                'nullable',
                'string',
                function ($attribute, $value, $fail) {
                    if (!$value) return;
                    try {
                        $dt = \Carbon\Carbon::parse($value, 'Asia/Jakarta');
                    } catch (\Throwable $e) {
                        $fail('The schedule date is not a valid datetime.');
                        return;
                    }
                    if ($dt->utc()->isPast()) {
                        $fail('The new schedule must be in the future.');
                    }
                },
            ],
            'notes' => 'nullable|string|max:2000',
        ]);

        switch ($validated['action']) {
            case 'confirm':
                if ($consultation->status !== 'pending') {
                    return response()->json(['message' => 'Only pending bookings can be confirmed.'], 422);
                }
                $consultation->update(['status' => 'confirmed']);
                $body = "Your consultation on " . $consultation->schedule_date->copy()->timezone('Asia/Jakarta')->format('d M Y H:i') . " WIB has been CONFIRMED.";
                break;

            case 'reject':
                if (in_array($consultation->status, ['completed', 'cancelled'])) {
                    return response()->json(['message' => 'This booking is already closed.'], 422);
                }
                $consultation->update([
                    'status' => 'cancelled',
                    'notes' => trim(($consultation->notes ? $consultation->notes . "\n" : '') . 'Declined: ' . ($validated['notes'] ?? 'no reason given')),
                ]);
                $body = "Your consultation request was declined by the notary. " . ($validated['notes'] ?? '');
                break;

            case 'reschedule':
                if (!in_array($consultation->status, ['pending', 'confirmed'])) {
                    return response()->json(['message' => 'Only active bookings can be rescheduled.'], 422);
                }
                $newDate = \Carbon\Carbon::parse($validated['schedule_date'], 'Asia/Jakarta')->timezone(config('app.timezone'));
                $old = $consultation->schedule_date->copy()->timezone('Asia/Jakarta')->format('d M Y H:i');
                $consultation->update([
                    'schedule_date' => $newDate,
                    'status' => 'confirmed',
                ]);
                $body = "Consultation rescheduled from {$old} to " . $newDate->copy()->timezone('Asia/Jakarta')->format('d M Y H:i') . " WIB.";
                break;

            case 'complete':
            default:
                if ($consultation->status !== 'confirmed') {
                    return response()->json(['message' => 'Only confirmed bookings can be completed.'], 422);
                }
                $consultation->update(['status' => 'completed']);
                $body = "Your consultation has been marked complete" . ($validated['notes'] ? ". Notes: {$validated['notes']}" : '.') ;
                break;
        }

        Notification::create([
            'user_id' => $consultation->user_id,
            'type' => $validated['action'] === 'reject' ? 'consultation_declined'
                     : ($validated['action'] === 'reschedule' ? 'consultation_rescheduled'
                     : ($validated['action'] === 'complete' ? 'consultation_completed' : 'consultation_confirmed')),
            'title' => 'Consultation Update',
            'body' => $body,
            'data' => ['consultation_id' => $consultation->id, 'notaris_id' => $consultation->notaris_id],
        ]);

        return response()->json(['message' => 'Consultation updated.', 'data' => $consultation->fresh()]);
    }
}
