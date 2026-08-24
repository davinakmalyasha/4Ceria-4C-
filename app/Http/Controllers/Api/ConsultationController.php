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
            'schedule_date' => 'required|date|after:now',
            'notes' => 'nullable|string|max:2000',
        ]);

        $user = Auth::user();
        $notary = NotarisProfile::with('user')->find($validated['notaris_id']);

        if (!$notary || !$notary->user) {
            return response()->json(['message' => 'Notary not found.'], 404);
        }

        // Prevent duplicate pending bookings for the same slot.
        $existing = NotarisConsultation::where('notaris_id', $notary->id)
            ->where('user_id', $user->id)
            ->where('schedule_date', $validated['schedule_date'])
            ->whereIn('status', ['pending', 'confirmed'])
            ->exists();

        if ($existing) {
            return response()->json(['message' => 'You already have a consultation booked for this time.'], 422);
        }

        $consultation = NotarisConsultation::create([
            'notaris_id' => $notary->id,
            'user_id' => $user->id,
            'schedule_date' => $validated['schedule_date'],
            'status' => 'pending',
            'notes' => $validated['notes'] ?? null,
        ]);

        Notification::create([
            'user_id' => $notary->user_id,
            'type' => 'consultation_requested',
            'title' => 'New Consultation Booking',
            'body' => "{$user->name} requested a consultation on " .
                \Carbon\Carbon::parse($validated['schedule_date'])->format('d M Y H:i') . '.',
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
}
