<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\MepEngineer;
use App\Models\NotarisProfile;
use App\Models\InteriorProfile;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SecureVerificationDocumentController extends Controller
{
    /**
     * Authorize access and return a 5-minute pre-signed expiring URL for a secure verification document.
     */
    public function getSignedUrl(Request $request, $type, $id, $field)
    {
        $user = $request->user();

        // 1. Map type to profile model
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
        ];

        if (!isset($modelMap[$type])) {
            return response()->json(['message' => 'Invalid professional type'], 400);
        }

        // 2. Prevent arbitrary column reads - restrict to verification file columns
        $allowedFields = ['file_portofolio', 'npwp', 'file_sertifikat', 'siup', 'foto'];
        if (!in_array($field, $allowedFields)) {
            return response()->json(['message' => 'Invalid document request field'], 400);
        }

        $modelClass = $modelMap[$type];
        $profile = $modelClass::findOrFail($id);

        // 3. strict Authorization: Only Admin OR the owner of this profile can preview
        $isAdmin = $user->hasRole('admin');
        $isOwner = (int) $profile->user_id === (int) $user->id;

        if (!$isAdmin && !$isOwner) {
            return response()->json(['message' => 'Unauthorized access to credentials.'], 403);
        }

        // 4. Retrieve stored storage path
        $path = $profile->$field;
        if (empty($path)) {
            return response()->json(['message' => 'No document uploaded for this field.'], 404);
        }

        // 5. Generate secure, expiring 5-minute Signed URL via Supabase Storage
        try {
            $isPdf = strtolower(pathinfo($path, PATHINFO_EXTENSION)) === 'pdf';
            $options = [];
            
            if ($isPdf) {
                $options['ResponseContentType'] = 'application/pdf';
                $options['ResponseContentDisposition'] = 'inline; filename="' . basename($path) . '"';
            }

            $temporaryUrl = Storage::disk('supabase')->temporaryUrl($path, now()->addMinutes(5), $options);
            return response()->json(['url' => $temporaryUrl]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to generate secure preview URL',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
