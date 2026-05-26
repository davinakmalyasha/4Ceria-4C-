<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\MepEngineer;
use App\Models\NotarisProfile;
use App\Models\InteriorProfile;
use App\Models\Supplier;
use App\Notifications\ProfessionalStatusNotification;
use Illuminate\Http\Request;

class VerificationController extends Controller
{
    public function index()
    {
        return response()->json([
            'arsiteks' => Arsitek::with('user')->where('verification_status', 'pending')->get(),
            'kontraktors' => Kontraktor::with('user')->where('verification_status', 'pending')->get(),
            'project_managers' => ProjectManager::with('user')->where('verification_status', 'pending')->get(),
            'structural_engineers' => StructuralEngineer::with('user')->where('verification_status', 'pending')->get(),
            'mep_engineers' => MepEngineer::with('user')->where('verification_status', 'pending')->get(),
            'notaries' => NotarisProfile::with('user')->where('verification_status', 'pending')->get(),
            'interiors' => InteriorProfile::with('user')->where('verification_status', 'pending')->get(),
            'suppliers' => Supplier::with('user')->where('verification_status', 'pending')->get(),
        ]);
    }

    public function updateStatus(Request $request, $type, $id)
    {
        $validated = $request->validate([
            'status' => 'required|in:verified,rejected',
            'reason' => 'nullable|string|max:500',
        ]);

        $modelMap = [
            'arsitek' => Arsitek::class,
            'kontraktor' => Kontraktor::class,
            'project_manager' => ProjectManager::class,
            'structural' => StructuralEngineer::class,
            'mep' => MepEngineer::class,
            'notaris' => NotarisProfile::class,
            'interior' => InteriorProfile::class,
            'supplier' => Supplier::class,
        ];

        if (!isset($modelMap[$type])) {
            return response()->json(['message' => 'Invalid professional type'], 400);
        }

        $modelClass = $modelMap[$type];
        $model = $modelClass::findOrFail($id);

        $model->update([
            'verification_status' => $validated['status'],
            'rejection_reason' => $validated['status'] === 'rejected' ? $validated['reason'] : null,
        ]);

        // Notify user
        try {
            $model->user->notify(new ProfessionalStatusNotification($validated['status'], ucfirst($type), $validated['reason'] ?? null));
        } catch (\Exception $e) {
            // Silently catch if notification channel fails
        }

        return response()->json([
            'message' => "Professional status updated to {$validated['status']}",
            'professional' => $model->load('user'),
        ]);
    }
}
