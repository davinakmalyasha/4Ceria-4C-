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
     * Strip auth-sensitive attributes from the nested user object
     * before public serialization (email etc. must never be exposed
     * on unauthenticated directory listings).
     */
    private function sanitizePublicPayload($data)
    {
        $sensitive = ['email', 'email_verified_at', 'google_id', 'two_factor_secret', 'two_factor_recovery_codes'];

        return $data->map(function ($professional) use ($sensitive) {
            if ($professional->relationLoaded('user') && $professional->user) {
                $professional->user->makeHidden($sensitive);
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
