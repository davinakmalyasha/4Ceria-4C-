<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\InteriorProfile;
use App\Models\NotarisProfile;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\MepEngineer;
use Illuminate\Support\Facades\Cache;

class PublicProfessionalController extends Controller
{
    /**
     * Strip auth-sensitive attributes from the nested user object and
     * KYC/government-identity fields from the profile itself before public
     * serialization. Raw-model serialization previously leaked identity
     * numbers, NPWP/SIUP document paths (into the PRIVATE bucket) and bank
     * details on unauthenticated directory listings.
     */
    private function sanitizePublicPayload($data)
    {
        $sensitiveUser = [
            'email', 'email_verified_at', 'google_id',
            'two_factor_secret', 'two_factor_recovery_codes',
            'bank_name', 'bank_account_number', 'bank_account_name', 'unique_code',
        ];
        // Government identity numbers + private-bucket KYC document paths +
        // internal review state must never appear on public payloads.
        // file_portofolio is KYC-grade too: several verification flows store
        // the KTP/ID scan in this column, and it shares its path with npwp.
        $sensitiveProfile = [
            'identity_number', 'npwp_number', 'siup_number',
            'npwp', 'siup', 'file_sertifikat', 'file_portofolio',
            'verification_status', 'rejection_reason', 'verified_at',
        ];

        return $data->map(function ($professional) use ($sensitiveUser, $sensitiveProfile) {
            $professional->makeHidden($sensitiveProfile);
            if ($professional->relationLoaded('user') && $professional->user) {
                $professional->user->makeHidden($sensitiveUser);
            }
            return $professional;
        });
    }

    public function getArsiteks()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_arsitek_list', 600, function () {
                return Arsitek::with(['user.phoneNumber', 'user.teamMembers', 'ratings', 'projects.images'])->get();
            })
            : Cache::remember('api_arsitek_list', 600, function () {
                return Arsitek::with(['user.phoneNumber', 'user.teamMembers', 'ratings', 'projects.images'])->get();
            });
        return response()->json(['data' => $this->sanitizePublicPayload($data)]);
    }

    public function getKontraktors()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_kontraktor_list', 600, function () {
                return Kontraktor::with(['user.phoneNumber', 'user.teamMembers', 'ratings', 'spesialisasis', 'projects.images'])->get();
            })
            : Cache::remember('api_kontraktor_list', 600, function () {
                return Kontraktor::with(['user.phoneNumber', 'user.teamMembers', 'ratings', 'spesialisasis', 'projects.images'])->get();
            });
        return response()->json(['data' => $this->sanitizePublicPayload($data)]);
    }

    public function getInteriors()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_interior_list', 600, function () {
                return InteriorProfile::with(['user.phoneNumber', 'ratings', 'projects.images'])->get();
            })
            : Cache::remember('api_interior_list', 600, function () {
                return InteriorProfile::with(['user.phoneNumber', 'ratings', 'projects.images'])->get();
            });
        return response()->json(['data' => $this->sanitizePublicPayload($data)]);
    }

    public function getNotarises()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_notaris_list', 600, function () {
                return NotarisProfile::with(['user.phoneNumber', 'ratings', 'services'])->get();
            })
            : Cache::remember('api_notaris_list', 600, function () {
                return NotarisProfile::with(['user.phoneNumber', 'ratings', 'services'])->get();
            });
        return response()->json(['data' => $this->sanitizePublicPayload($data)]);
    }

    public function getProjectManagers()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_project_manager_list', 600, function () {
                return ProjectManager::with(['user.phoneNumber', 'ratings', 'projects.images'])->get();
            })
            : Cache::remember('api_project_manager_list', 600, function () {
                return ProjectManager::with(['user.phoneNumber', 'ratings', 'projects.images'])->get();
            });
        return response()->json(['data' => $this->sanitizePublicPayload($data)]);
    }

    public function getStructuralEngineers()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_structural_list', 600, function () {
                return StructuralEngineer::with(['user.phoneNumber'])->get();
            })
            : Cache::remember('api_structural_list', 600, function () {
                return StructuralEngineer::with(['user.phoneNumber'])->get();
            });
        return response()->json(['data' => $this->sanitizePublicPayload($data)]);
    }

    public function getMepEngineers()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_mep_list', 600, function () {
                return MepEngineer::with(['user.phoneNumber'])->get();
            })
            : Cache::remember('api_mep_list', 600, function () {
                return MepEngineer::with(['user.phoneNumber'])->get();
            });
        return response()->json(['data' => $this->sanitizePublicPayload($data)]);
    }
}
