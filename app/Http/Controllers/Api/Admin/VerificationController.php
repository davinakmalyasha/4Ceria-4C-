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
use App\Models\CourierProfile;
use App\Notifications\ProfessionalStatusNotification;
use Illuminate\Http\Request;

class VerificationController extends Controller
{
    public function index()
    {
        $hasDocs = function ($q) {
            $q->whereNotNull('foto')
              ->orWhereNotNull('file_portofolio')
              ->orWhereNotNull('file_sertifikat')
              ->orWhereNotNull('npwp')
              ->orWhereNotNull('siup')
              ->orWhereNotNull('identity_number');
        };

        return response()->json([
            'arsiteks' => Arsitek::with('user')->where('verification_status', 'pending')->where($hasDocs)->get(),
            'kontraktors' => Kontraktor::with('user')->whereHas('user', function ($q) {
                $q->where('role_type', 'kontraktor');
            })->where('verification_status', 'pending')->where($hasDocs)->get(),
            'civil_contractors' => Kontraktor::with('user')->whereHas('user', function ($q) {
                $q->where('role_type', 'civil');
            })->where('verification_status', 'pending')->where($hasDocs)->get(),
            'mechanical_contractors' => Kontraktor::with('user')->whereHas('user', function ($q) {
                $q->where('role_type', 'mechanical');
            })->where('verification_status', 'pending')->where($hasDocs)->get(),
            'electrical_contractors' => Kontraktor::with('user')->whereHas('user', function ($q) {
                $q->where('role_type', 'electrical');
            })->where('verification_status', 'pending')->where($hasDocs)->get(),
            'plumbing_contractors' => Kontraktor::with('user')->whereHas('user', function ($q) {
                $q->where('role_type', 'plumbing');
            })->where('verification_status', 'pending')->where($hasDocs)->get(),
            'roofing_contractors' => Kontraktor::with('user')->whereHas('user', function ($q) {
                $q->where('role_type', 'roofing');
            })->where('verification_status', 'pending')->where($hasDocs)->get(),
            'finishing_contractors' => Kontraktor::with('user')->whereHas('user', function ($q) {
                $q->where('role_type', 'finishing');
            })->where('verification_status', 'pending')->where($hasDocs)->get(),
            'project_managers' => ProjectManager::with('user')->where('verification_status', 'pending')->where($hasDocs)->get(),
            'structural_engineers' => StructuralEngineer::with('user')->where('verification_status', 'pending')->where($hasDocs)->get(),
            'mep_engineers' => MepEngineer::with('user')->where('verification_status', 'pending')->where($hasDocs)->get(),
            'notaries' => NotarisProfile::with('user')->where('verification_status', 'pending')->where($hasDocs)->get(),
            'interiors' => InteriorProfile::with('user')->where('verification_status', 'pending')->where($hasDocs)->get(),
            'suppliers' => Supplier::with('user')->where('verification_status', 'pending')->where(function ($q) {
                $q->whereNotNull('foto')
                  ->orWhereNotNull('address')
                  ->orWhereNotNull('bio')
                  ->orWhereNotNull('no_telp');
            })->get(),
            'logistics' => CourierProfile::with('user')->where('verification_status', 'pending')->get(),
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
            'civil' => Kontraktor::class,
            'mechanical' => Kontraktor::class,
            'electrical' => Kontraktor::class,
            'plumbing' => Kontraktor::class,
            'roofing' => Kontraktor::class,
            'finishing' => Kontraktor::class,
            'project_manager' => ProjectManager::class,
            'structural' => StructuralEngineer::class,
            'mep' => MepEngineer::class,
            'notaris' => NotarisProfile::class,
            'interior' => InteriorProfile::class,
            'supplier' => Supplier::class,
            'logistics' => CourierProfile::class,
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

        // Create custom dashboard notification
        try {
            $statusText = $validated['status'] === 'verified' ? 'Approved' : 'Rejected';
            $title = "Account Verification " . $statusText;
            $body = $validated['status'] === 'verified'
                ? "Your request to join as a " . ucfirst($type) . " has been approved! You can now access professional features."
                : "Your request to join as a " . ucfirst($type) . " has been rejected. Reason: " . ($validated['reason'] ?? 'No specific reason provided.');

            \App\Models\Notification::create([
                'user_id' => $model->user_id,
                'type' => 'verification',
                'title' => $title,
                'body' => $body,
                'data' => [
                    'status' => $validated['status'],
                    'professional_type' => $type,
                    'reason' => $validated['reason'] ?? null,
                ],
            ]);
        } catch (\Exception $e) {
            // Silently catch custom notification errors
        }

        // Notify user via Email if requested
        try {
            $sendEmail = $request->boolean('send_email', true);
            if ($sendEmail) {
                $model->user->notify(new ProfessionalStatusNotification($validated['status'], ucfirst($type), $validated['reason'] ?? null, ['mail']));
            }
        } catch (\Exception $e) {
            // Silently catch if notification channel fails
        }

        return response()->json([
            'message' => "Professional status updated to {$validated['status']}",
            'professional' => $model->load('user'),
        ]);
    }

    public function history()
    {
        $modelMap = [
            'arsitek' => [Arsitek::class, 'Architect'],
            'project_manager' => [ProjectManager::class, 'Project Manager'],
            'structural' => [StructuralEngineer::class, 'Structural Engineer'],
            'mep' => [MepEngineer::class, 'MEP Engineer'],
            'notaris' => [NotarisProfile::class, 'Notary'],
            'interior' => [InteriorProfile::class, 'Interior Designer'],
            'supplier' => [Supplier::class, 'Supplier'],
            'logistics' => [CourierProfile::class, 'Logistics / Courier'],
        ];

        $history = collect();

        foreach ($modelMap as $type => $config) {
            $modelClass = $config[0];
            $roleLabel = $config[1];

            $records = $modelClass::with('user')
                ->whereIn('verification_status', ['verified', 'rejected'])
                ->get();

            foreach ($records as $record) {
                $displayName = $record->store_name ?? $record->nama_perusahaan ?? $record->nama ?? ($record->user->name ?? 'N/A');

                $history->push([
                    'id' => $record->id,
                    'type' => $type,
                    'role_label' => $roleLabel,
                    'name' => $displayName,
                    'email' => $record->user->email ?? 'N/A',
                    'status' => $record->verification_status,
                    'rejection_reason' => $record->rejection_reason,
                    'audited_at' => $record->updated_at ? $record->updated_at->toIso8601String() : null,
                ]);
            }
        }

        // Handle Contractors table (General + Subspecialties)
        $contractorRecords = Kontraktor::with('user')
            ->whereIn('verification_status', ['verified', 'rejected'])
            ->get();

        $subRoleLabels = [
            'kontraktor' => ['kontraktor', 'Contractor'],
            'civil' => ['civil', 'Civil Contractor'],
            'mechanical' => ['mechanical', 'Mechanical Contractor'],
            'electrical' => ['electrical', 'Electrical Contractor'],
            'plumbing' => ['plumbing', 'Plumbing Contractor'],
            'roofing' => ['roofing', 'Roofing Contractor'],
            'finishing' => ['finishing', 'Finishing Contractor'],
        ];

        foreach ($contractorRecords as $record) {
            $roleType = $record->user->role_type ?? 'kontraktor';
            $cfg = $subRoleLabels[$roleType] ?? ['kontraktor', 'Contractor'];

            $displayName = $record->nama_perusahaan ?? $record->nama ?? ($record->user->name ?? 'N/A');

            $history->push([
                'id' => $record->id,
                'type' => $cfg[0],
                'role_label' => $cfg[1],
                'name' => $displayName,
                'email' => $record->user->email ?? 'N/A',
                'status' => $record->verification_status,
                'rejection_reason' => $record->rejection_reason,
                'audited_at' => $record->updated_at ? $record->updated_at->toIso8601String() : null,
            ]);
        }

        $sortedHistory = $history->sortByDesc('audited_at')->values();

        return response()->json($sortedHistory);
    }
}

