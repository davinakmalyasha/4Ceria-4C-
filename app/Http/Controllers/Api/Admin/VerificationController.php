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

    public function history(Request $request)
    {
        $queries = [];

        // Arsitek
        $queries[] = \Illuminate\Support\Facades\DB::table('arsiteks')
            ->join('users', 'arsiteks.user_id', '=', 'users.id')
            ->select(
                'arsiteks.id as id',
                \Illuminate\Support\Facades\DB::raw("'arsitek' as type"),
                \Illuminate\Support\Facades\DB::raw("'Architect' as role_label"),
                \Illuminate\Support\Facades\DB::raw("COALESCE(arsiteks.nama, users.name, 'N/A') as name"),
                'users.email as email',
                'arsiteks.verification_status as status',
                'arsiteks.rejection_reason as rejection_reason',
                'arsiteks.updated_at as audited_at'
            )
            ->whereIn('arsiteks.verification_status', ['verified', 'rejected']);

        // Project Manager
        $queries[] = \Illuminate\Support\Facades\DB::table('project_managers')
            ->join('users', 'project_managers.user_id', '=', 'users.id')
            ->select(
                'project_managers.id as id',
                \Illuminate\Support\Facades\DB::raw("'project_manager' as type"),
                \Illuminate\Support\Facades\DB::raw("'Project Manager' as role_label"),
                \Illuminate\Support\Facades\DB::raw("COALESCE(project_managers.nama, users.name, 'N/A') as name"),
                'users.email as email',
                'project_managers.verification_status as status',
                'project_managers.rejection_reason as rejection_reason',
                'project_managers.updated_at as audited_at'
            )
            ->whereIn('project_managers.verification_status', ['verified', 'rejected']);

        // Structural Engineer
        $queries[] = \Illuminate\Support\Facades\DB::table('structural_engineers')
            ->join('users', 'structural_engineers.user_id', '=', 'users.id')
            ->select(
                'structural_engineers.id as id',
                \Illuminate\Support\Facades\DB::raw("'structural' as type"),
                \Illuminate\Support\Facades\DB::raw("'Structural Engineer' as role_label"),
                \Illuminate\Support\Facades\DB::raw("COALESCE(structural_engineers.nama, users.name, 'N/A') as name"),
                'users.email as email',
                'structural_engineers.verification_status as status',
                'structural_engineers.rejection_reason as rejection_reason',
                'structural_engineers.updated_at as audited_at'
            )
            ->whereIn('structural_engineers.verification_status', ['verified', 'rejected']);

        // MEP Engineer
        $queries[] = \Illuminate\Support\Facades\DB::table('mep_engineers')
            ->join('users', 'mep_engineers.user_id', '=', 'users.id')
            ->select(
                'mep_engineers.id as id',
                \Illuminate\Support\Facades\DB::raw("'mep' as type"),
                \Illuminate\Support\Facades\DB::raw("'MEP Engineer' as role_label"),
                \Illuminate\Support\Facades\DB::raw("COALESCE(mep_engineers.nama, users.name, 'N/A') as name"),
                'users.email as email',
                'mep_engineers.verification_status as status',
                'mep_engineers.rejection_reason as rejection_reason',
                'mep_engineers.updated_at as audited_at'
            )
            ->whereIn('mep_engineers.verification_status', ['verified', 'rejected']);

        // Notary
        $queries[] = \Illuminate\Support\Facades\DB::table('notaris_profiles')
            ->join('users', 'notaris_profiles.user_id', '=', 'users.id')
            ->select(
                'notaris_profiles.id as id',
                \Illuminate\Support\Facades\DB::raw("'notaris' as type"),
                \Illuminate\Support\Facades\DB::raw("'Notary' as role_label"),
                \Illuminate\Support\Facades\DB::raw("COALESCE(notaris_profiles.nama, users.name, 'N/A') as name"),
                'users.email as email',
                'notaris_profiles.verification_status as status',
                'notaris_profiles.rejection_reason as rejection_reason',
                'notaris_profiles.updated_at as audited_at'
            )
            ->whereIn('notaris_profiles.verification_status', ['verified', 'rejected']);

        // Interior Designer
        $queries[] = \Illuminate\Support\Facades\DB::table('interior_profiles')
            ->join('users', 'interior_profiles.user_id', '=', 'users.id')
            ->select(
                'interior_profiles.id as id',
                \Illuminate\Support\Facades\DB::raw("'interior' as type"),
                \Illuminate\Support\Facades\DB::raw("'Interior Designer' as role_label"),
                \Illuminate\Support\Facades\DB::raw("COALESCE(interior_profiles.nama, users.name, 'N/A') as name"),
                'users.email as email',
                'interior_profiles.verification_status as status',
                'interior_profiles.rejection_reason as rejection_reason',
                'interior_profiles.updated_at as audited_at'
            )
            ->whereIn('interior_profiles.verification_status', ['verified', 'rejected']);

        // Supplier
        $queries[] = \Illuminate\Support\Facades\DB::table('suppliers')
            ->join('users', 'suppliers.user_id', '=', 'users.id')
            ->select(
                'suppliers.id as id',
                \Illuminate\Support\Facades\DB::raw("'supplier' as type"),
                \Illuminate\Support\Facades\DB::raw("'Supplier' as role_label"),
                \Illuminate\Support\Facades\DB::raw("COALESCE(suppliers.store_name, users.name, 'N/A') as name"),
                'users.email as email',
                'suppliers.verification_status as status',
                'suppliers.rejection_reason as rejection_reason',
                'suppliers.updated_at as audited_at'
            )
            ->whereIn('suppliers.verification_status', ['verified', 'rejected']);

        // Logistics / Courier
        $queries[] = \Illuminate\Support\Facades\DB::table('courier_profiles')
            ->join('users', 'courier_profiles.user_id', '=', 'users.id')
            ->select(
                'courier_profiles.id as id',
                \Illuminate\Support\Facades\DB::raw("'logistics' as type"),
                \Illuminate\Support\Facades\DB::raw("'Logistics / Courier' as role_label"),
                \Illuminate\Support\Facades\DB::raw("COALESCE(users.name, 'N/A') as name"),
                'users.email as email',
                'courier_profiles.verification_status as status',
                'courier_profiles.rejection_reason as rejection_reason',
                'courier_profiles.updated_at as audited_at'
            )
            ->whereIn('courier_profiles.verification_status', ['verified', 'rejected']);

        // Contractor (handles general + subspecialties)
        $queries[] = \Illuminate\Support\Facades\DB::table('kontraktors')
            ->join('users', 'kontraktors.user_id', '=', 'users.id')
            ->select(
                'kontraktors.id as id',
                \Illuminate\Support\Facades\DB::raw("CASE 
                    WHEN users.role_type = 'civil' THEN 'civil'
                    WHEN users.role_type = 'mechanical' THEN 'mechanical'
                    WHEN users.role_type = 'electrical' THEN 'electrical'
                    WHEN users.role_type = 'plumbing' THEN 'plumbing'
                    WHEN users.role_type = 'roofing' THEN 'roofing'
                    WHEN users.role_type = 'finishing' THEN 'finishing'
                    ELSE 'kontraktor'
                END as type"),
                \Illuminate\Support\Facades\DB::raw("CASE 
                    WHEN users.role_type = 'civil' THEN 'Civil Contractor'
                    WHEN users.role_type = 'mechanical' THEN 'Mechanical Contractor'
                    WHEN users.role_type = 'electrical' THEN 'Electrical Contractor'
                    WHEN users.role_type = 'plumbing' THEN 'Plumbing Contractor'
                    WHEN users.role_type = 'roofing' THEN 'Roofing Contractor'
                    WHEN users.role_type = 'finishing' THEN 'Finishing Contractor'
                    ELSE 'Contractor'
                END as role_label"),
                \Illuminate\Support\Facades\DB::raw("COALESCE(kontraktors.nama_perusahaan, kontraktors.nama, users.name, 'N/A') as name"),
                'users.email as email',
                'kontraktors.verification_status as status',
                'kontraktors.rejection_reason as rejection_reason',
                'kontraktors.updated_at as audited_at'
            )
            ->whereIn('kontraktors.verification_status', ['verified', 'rejected']);

        $firstQuery = array_shift($queries);
        foreach ($queries as $q) {
            $firstQuery->unionAll($q);
        }

        $totalQuery = \Illuminate\Support\Facades\DB::table(\Illuminate\Support\Facades\DB::raw("({$firstQuery->toSql()}) as union_table"))
            ->mergeBindings($firstQuery)
            ->orderByDesc('audited_at');

        $paginated = $totalQuery->paginate(20);

        // Format dates into ISO8601 strings to maintain consistency with previous implementation
        $paginated->getCollection()->transform(function ($item) {
            if (isset($item->audited_at)) {
                $item->audited_at = \Illuminate\Support\Carbon::parse($item->audited_at)->toIso8601String();
            }
            return $item;
        });

        return response()->json($paginated);
    }
}

