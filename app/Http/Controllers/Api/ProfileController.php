<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\MepEngineer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    public function updateProfessional(Request $request)
    {
        $user = $request->user();

        $validatedUser = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email,'.$user->id,
            'username' => 'required|string|max:255|unique:users,username,'.$user->id,
            'phone_numbers' => 'nullable|string', // Received as JSON string due to FormData
        ]);

        $user->update([
            'name' => $validatedUser['name'],
            'email' => $validatedUser['email'],
            'username' => $validatedUser['username'],
        ]);

        if ($request->has('phone_numbers')) {
            $phones = json_decode($request->phone_numbers, true);
            if (is_array($phones)) {
                $user->phoneNumber()->whereNotIn('contact', $phones)->delete();
                $existing = $user->phoneNumber()->pluck('contact')->toArray();
                foreach ($phones as $num) {
                    if (! in_array($num, $existing) && ! empty(trim($num))) {
                        $user->phoneNumber()->create(['contact' => trim($num)]);
                    }
                }
            }
        }

        if ($user->role_type === 'arsitek') {
            $validatedArsitek = $request->validate([
                'rate_harga' => 'nullable|numeric',
                'pengalaman_tahun' => 'nullable|numeric',
                'spesialisasi' => 'nullable|string',
                'lokasi' => 'nullable|string',
                'no_telp' => 'nullable|string',
                'deskripsi' => 'nullable|string',
                'pendidikan' => 'nullable|string',
                'alasan_hire' => 'nullable|string',
            ]);

            $arsitek = $user->arsitek;
            if (! $arsitek) {
                $arsitek = Arsitek::create(['user_id' => $user->id, 'nama' => $user->name]);
            }

            $arsitek->update($validatedArsitek);
            $this->processVerificationDetails($request, $arsitek);
        }

        if (in_array($user->role_type, ['kontraktor', 'civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'])) {
            if (in_array($user->role_type, ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'])) {
                if ($request->has('lokasi') && !$request->has('alamat')) {
                    $request->merge(['alamat' => $request->lokasi]);
                }
                if ($request->has('no_telp') && !$request->has('no_telepon')) {
                    $request->merge(['no_telepon' => $request->no_telp]);
                }
                if ($request->has('pengalaman_tahun') && !$request->has('pengalaman')) {
                    $request->merge(['pengalaman' => $request->pengalaman_tahun]);
                }
            }

            $validatedKontraktor = $request->validate([
                'nama_perusahaan' => 'nullable|string',
                'alamat' => 'nullable|string',
                'no_telepon' => 'nullable|string',
                'rate_harga' => 'nullable|numeric',
                'pengalaman' => 'nullable|string',
                'jenis' => 'nullable|string',
                'pendidikan' => 'nullable|string',
                'alasan_hire' => 'nullable|string',
                'spesialisasi' => 'nullable|string',
            ]);

            $kontraktor = $user->kontraktor;
            if (! $kontraktor) {
                $kontraktor = Kontraktor::create(['user_id' => $user->id, 'nama' => $user->name]);
            }

            $kontraktor->update($validatedKontraktor);
            $this->processVerificationDetails($request, $kontraktor);
        }

        if ($user->role_type === 'interior') {
            $validatedInterior = $request->validate([
                'rate_harga' => 'nullable|numeric',
                'pengalaman_tahun' => 'nullable|numeric',
                'spesialisasi' => 'nullable|string',
                'lokasi' => 'nullable|string',
                'no_telp' => 'nullable|string',
                'deskripsi' => 'nullable|string',
            ]);

            $interior = $user->interior_profile;
            if (! $interior) {
                $interior = \App\Models\InteriorProfile::create(['user_id' => $user->id, 'nama' => $user->name]);
            }

            $interior->update($validatedInterior);
            $this->processVerificationDetails($request, $interior);
        }

        if ($user->role_type === 'notaris') {
            $validatedNotaris = $request->validate([
                'nama' => 'nullable|string',
                'no_telp' => 'nullable|string',
                'nomor_sk' => 'nullable|string',
                'wilayah_kerja' => 'nullable|string',
                'spesialisasi' => 'nullable|string',
                'lokasi' => 'nullable|string',
                'deskripsi' => 'nullable|string',
                'pengalaman_tahun' => 'nullable|numeric',
                'rate_harga' => 'nullable|numeric',
            ]);

            $notaris = $user->notaris_profile;
            if (! $notaris) {
                $notaris = \App\Models\NotarisProfile::create(['user_id' => $user->id, 'nama' => $user->name]);
            }

            $notaris->update($validatedNotaris);
            $this->processVerificationDetails($request, $notaris);

            if ($request->has('services')) {
                $services = json_decode($request->services, true);
                if (is_array($services)) {
                    $notaris->services()->delete(); // Clear existing
                    foreach ($services as $service) {
                        $notaris->services()->create([
                            'title' => $service['title'],
                            'price' => $service['price'],
                            'description' => $service['description'] ?? null,
                        ]);
                    }
                }
            }
        }

        if (in_array($user->role_type, ['project_manager', 'structural', 'mep'])) {
            $this->updateEnterpriseProfile($request, $user);
        }

        return response()->json([
            'message' => 'Professional profile updated successfully',
            'user' => $user->fresh()->load([
                'phoneNumber', 
                'arsitek', 
                'kontraktor',
                'interior_profile', 
                'notaris_profile.services',
                'project_manager', 
                'structural_engineer', 
                'mep_engineer',
            ]),
        ]);
    }

    /**
     * Shared handler for PM / Structural / MEP profiles.
     */
    private function updateEnterpriseProfile(Request $request, $user): void
    {
        $validated = $request->validate([
            'rate_harga'       => 'nullable|numeric',
            'pengalaman_tahun' => 'nullable|numeric',
            'spesialisasi'     => 'nullable|string',
            'lokasi'           => 'nullable|string',
            'no_telp'          => 'nullable|string',
            'deskripsi'        => 'nullable|string',
            'pendidikan'       => 'nullable|string',
            'alasan_hire'      => 'nullable|string',
        ]);

        $modelMap = [
            'project_manager' => [ProjectManager::class, 'project_manager'],
            'structural'      => [StructuralEngineer::class, 'structural_engineer'],
            'mep'             => [MepEngineer::class, 'mep_engineer'],
        ];

        [$modelClass, $relation] = $modelMap[$user->role_type];

        $profile = $user->$relation;
        if (! $profile) {
            $profile = $modelClass::create(['user_id' => $user->id, 'nama' => $user->name]);
        }

        $profile->update($validated);
        $this->processVerificationDetails($request, $profile);
    }

    /**
     * Standardise and store verification files and numbers for any professional profile.
     */
    private function processVerificationDetails(Request $request, $profile): void
    {
        $validated = $request->validate([
            'entity_type'      => 'nullable|in:individual,company',
            'company_name'     => 'nullable|string|max:255',
            'company_license'  => 'nullable|string|max:255',
            'identity_number'  => 'nullable|string|max:100',
            'npwp_number'      => 'nullable|string|max:100',
            'siup_number'      => 'nullable|string|max:100',
            'foto'             => 'nullable|file|mimes:jpg,png,jpeg|max:5120',
            'file_portofolio'  => 'nullable|file|mimes:pdf,zip,jpg,png|max:10240',
            'file_sertifikat'  => 'nullable|file|mimes:pdf,jpg,png|max:5120',
            'npwp'             => 'nullable|file|mimes:pdf,jpg,png|max:5120',
            'siup'             => 'nullable|file|mimes:pdf,jpg,png|max:5120',
        ]);

        $updates = [];

        // Save text metadata fields if present
        foreach (['entity_type', 'company_name', 'company_license', 'identity_number', 'npwp_number', 'siup_number'] as $field) {
            if ($request->has($field)) {
                $updates[$field] = $validated[$field];
            }
        }

        // Save Photo / Headshot / Logo
        if ($request->hasFile('foto')) {
            if ($profile->foto) {
                Storage::disk('public')->delete($profile->foto);
            }
            $updates['foto'] = \App\Services\ImageService::convertToWebp($request->file('foto'), 'portfolios/photos');
        }

        // Save Portfolio / NPWP document (equivalent)
        $portfolioFile = $request->file('file_portofolio') ?? $request->file('npwp');
        if ($portfolioFile) {
            if ($profile->file_portofolio) {
                Storage::disk('supabase')->delete($profile->file_portofolio);
            }
            if ($profile->npwp && $profile->npwp !== $profile->file_portofolio) {
                Storage::disk('supabase')->delete($profile->npwp);
            }
            $path = $portfolioFile->store('portfolios', 'supabase');
            $updates['file_portofolio'] = $path;
            $updates['npwp'] = $path; // keep both in sync for backward compatibility
        }

        // Save Certificate / SIUP document (equivalent)
        $sertifikatFile = $request->file('file_sertifikat') ?? $request->file('siup');
        if ($sertifikatFile) {
            if ($profile->file_sertifikat) {
                Storage::disk('supabase')->delete($profile->file_sertifikat);
            }
            if ($profile->siup && $profile->siup !== $profile->file_sertifikat) {
                Storage::disk('supabase')->delete($profile->siup);
            }
            $path = $sertifikatFile->store('certificates', 'supabase');
            $updates['file_sertifikat'] = $path;
            $updates['siup'] = $path; // keep both in sync for backward compatibility
        }

        // Auto-transition to pending verification if files or numbers are uploaded/updated
        $hasNewDoc = $portfolioFile || $sertifikatFile || $request->hasFile('foto') ||
                     $request->filled('identity_number') || $request->filled('npwp_number') || $request->filled('siup_number');

        if ($hasNewDoc && $profile->verification_status !== 'verified') {
            $updates['verification_status'] = 'pending';
        }

        $profile->update($updates);
    }
}
