<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NotarisConsultation;
use Illuminate\Http\Request;

class ConsultationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        if ($user->role_type === 'notaris') {
            $consultations = NotarisConsultation::where('notaris_id', $user->notaris_profile->id)
                ->with('user')
                ->latest()
                ->get();
        } else {
            $consultations = NotarisConsultation::where('user_id', $user->id)
                ->with('notaris.user')
                ->latest()
                ->get();
        }

        return response()->json(['data' => $consultations]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'notaris_id' => 'required|exists:notaris_profiles,id',
            'schedule_date' => 'required|date|after:now',
            'notes' => 'nullable|string',
        ]);

        $consultation = NotarisConsultation::create([
            'notaris_id' => $validated['notaris_id'],
            'user_id' => $request->user()->id,
            'schedule_date' => $validated['schedule_date'],
            'notes' => $validated['notes'],
            'status' => 'pending',
        ]);

        return response()->json([
            'message' => 'Consultation booked successfully',
            'data' => $consultation->load('notaris.user'),
        ]);
    }

    public function update(Request $request, NotarisConsultation $consultation)
    {
        $user = $request->user();

        // Only the notary can change status
        if ($user->role_type !== 'notaris' || $consultation->notaris_id !== $user->notaris_profile->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'status' => 'required|in:pending,confirmed,completed,cancelled',
        ]);

        $consultation->update($validated);

        return response()->json([
            'message' => 'Consultation status updated',
            'data' => $consultation->load('user'),
        ]);
    }
}
