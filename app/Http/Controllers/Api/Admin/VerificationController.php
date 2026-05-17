<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Notifications\ProfessionalStatusNotification;
use Illuminate\Http\Request;

class VerificationController extends Controller
{
    public function index()
    {
        $arsiteks = Arsitek::with('user')->where('verification_status', 'pending')->get();
        $kontraktors = Kontraktor::with('user')->where('verification_status', 'pending')->get();

        return response()->json([
            'arsiteks' => $arsiteks,
            'kontraktors' => $kontraktors,
        ]);
    }

    public function updateStatus(Request $request, $type, $id)
    {
        $validated = $request->validate([
            'status' => 'required|in:verified,rejected',
            'reason' => 'nullable|string|max:500',
        ]);

        $model = $type === 'arsitek' ? Arsitek::findOrFail($id) : Kontraktor::findOrFail($id);

        $model->update([
            'verification_status' => $validated['status'],
            'rejection_reason' => $validated['status'] === 'rejected' ? $validated['reason'] : null,
        ]);

        // Notify user
        $model->user->notify(new ProfessionalStatusNotification($validated['status'], ucfirst($type), $validated['reason'] ?? null));

        return response()->json([
            'message' => "Professional status updated to {$validated['status']}",
            'professional' => $model->load('user'),
        ]);
    }
}
