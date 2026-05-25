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
                'foto' => 'nullable|file|mimes:jpg,png,jpeg|max:5120',
                'file_portofolio' => 'nullable|file|mimes:pdf,zip,jpg,png|max:10240',
                'file_sertifikat' => 'nullable|file|mimes:pdf,jpg,png|max:5120',
            ]);

            $arsitek = $user->arsitek;
            if (! $arsitek) {
                $arsitek = Arsitek::create(['user_id' => $user->id, 'nama' => $user->name]);
            }

            if ($request->hasFile('file_portofolio')) {
                if ($arsitek->file_portofolio) {
                    Storage::disk('public')->delete($arsitek->file_portofolio);
                }
                $validatedArsitek['file_portofolio'] = $request->file('file_portofolio')->store('portfolios', 'public');
            } else {
                unset($validatedArsitek['file_portofolio']);
            }

            if ($request->hasFile('file_sertifikat')) {
                if ($arsitek->file_sertifikat) {
                    Storage::disk('public')->delete($arsitek->file_sertifikat);
                }
                $validatedArsitek['file_sertifikat'] = $request->file('file_sertifikat')->store('certificates', 'public');
            } else {
                unset($validatedArsitek['file_sertifikat']);
            }

            if ($request->hasFile('foto')) {
                if ($arsitek->foto) {
                    Storage::disk('public')->delete($arsitek->foto);
                }
                $validatedArsitek['foto'] = \App\Services\ImageService::convertToWebp($request->file('foto'), 'portfolios/photos');
            } else {
                unset($validatedArsitek['foto']);
            }

            $arsitek->update($validatedArsitek);
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
                'foto' => 'nullable|file|mimes:jpg,png,jpeg|max:5120',
                'npwp' => 'nullable|file|mimes:pdf,jpg,png|max:5120',
                'siup' => 'nullable|file|mimes:pdf,jpg,png|max:5120',
            ]);

            $kontraktor = $user->kontraktor;
            if (! $kontraktor) {
                $kontraktor = Kontraktor::create(['user_id' => $user->id, 'nama' => $user->name]);
            }

            if ($request->hasFile('npwp')) {
                if ($kontraktor->npwp) {
                    Storage::disk('public')->delete($kontraktor->npwp);
                }
                $validatedKontraktor['npwp'] = $request->file('npwp')->store('documents', 'public');
            } else {
                unset($validatedKontraktor['npwp']);
            }

            if ($request->hasFile('siup')) {
                if ($kontraktor->siup) {
                    Storage::disk('public')->delete($kontraktor->siup);
                }
                $validatedKontraktor['siup'] = $request->file('siup')->store('documents', 'public');
            } else {
                unset($validatedKontraktor['siup']);
            }

            if ($request->hasFile('foto')) {
                if ($kontraktor->foto) {
                    Storage::disk('public')->delete($kontraktor->foto);
                }
                $validatedKontraktor['foto'] = \App\Services\ImageService::convertToWebp($request->file('foto'), 'portfolios/photos');
            } else {
                unset($validatedKontraktor['foto']);
            }

            $kontraktor->update($validatedKontraktor);
        }

        if ($user->role_type === 'interior') {
            $validatedInterior = $request->validate([
                'rate_harga' => 'nullable|numeric',
                'pengalaman_tahun' => 'nullable|numeric',
                'spesialisasi' => 'nullable|string',
                'lokasi' => 'nullable|string',
                'no_telp' => 'nullable|string',
                'deskripsi' => 'nullable|string',
                'foto' => 'nullable|file|mimes:jpg,png,jpeg|max:5120',
                'file_portofolio' => 'nullable|file|mimes:pdf,zip,jpg,png|max:10240',
                'file_sertifikat' => 'nullable|file|mimes:pdf,jpg,png|max:5120',
            ]);

            $interior = $user->interior_profile;
            if (! $interior) {
                $interior = \App\Models\InteriorProfile::create(['user_id' => $user->id, 'nama' => $user->name]);
            }

            if ($request->hasFile('file_portofolio')) {
                if ($interior->file_portofolio) {
                    Storage::disk('public')->delete($interior->file_portofolio);
                }
                $validatedInterior['file_portofolio'] = $request->file('file_portofolio')->store('portfolios', 'public');
            } else {
                unset($validatedInterior['file_portofolio']);
            }

            if ($request->hasFile('file_sertifikat')) {
                if ($interior->file_sertifikat) {
                    Storage::disk('public')->delete($interior->file_sertifikat);
                }
                $validatedInterior['file_sertifikat'] = $request->file('file_sertifikat')->store('certificates', 'public');
            } else {
                unset($validatedInterior['file_sertifikat']);
            }

            if ($request->hasFile('foto')) {
                if ($interior->foto) {
                    Storage::disk('public')->delete($interior->foto);
                }
                $validatedInterior['foto'] = \App\Services\ImageService::convertToWebp($request->file('foto'), 'portfolios/photos');
            } else {
                unset($validatedInterior['foto']);
            }

            $interior->update($validatedInterior);
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
                'foto' => 'nullable|file|mimes:jpg,png,jpeg|max:5120',
                'file_sertifikat' => 'nullable|file|mimes:pdf,jpg,png|max:5120',
            ]);

            $notaris = $user->notaris_profile;
            if (! $notaris) {
                $notaris = \App\Models\NotarisProfile::create(['user_id' => $user->id, 'nama' => $user->name]);
            }

            if ($request->hasFile('file_sertifikat')) {
                if ($notaris->file_sertifikat) {
                    Storage::disk('public')->delete($notaris->file_sertifikat);
                }
                $validatedNotaris['file_sertifikat'] = $request->file('file_sertifikat')->store('certificates', 'public');
            } else {
                unset($validatedNotaris['file_sertifikat']);
            }

            if ($request->hasFile('foto')) {
                if ($notaris->foto) {
                    Storage::disk('public')->delete($notaris->foto);
                }
                $validatedNotaris['foto'] = \App\Services\ImageService::convertToWebp($request->file('foto'), 'portfolios/photos');
            } else {
                unset($validatedNotaris['foto']);
            }

            $notaris->update($validatedNotaris);

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
     * Shared handler for PM / Structural / MEP profiles (identical DB schema).
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
            'foto'             => 'nullable|file|mimes:jpg,png,jpeg|max:5120',
            'file_portofolio'  => 'nullable|file|mimes:pdf,zip,jpg,png|max:10240',
            'file_sertifikat'  => 'nullable|file|mimes:pdf,jpg,png|max:5120',
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

        $fileFields = ['foto' => 'portfolios/photos', 'file_portofolio' => 'portfolios', 'file_sertifikat' => 'certificates'];
        foreach ($fileFields as $field => $dir) {
            if ($request->hasFile($field)) {
                if ($profile->$field) {
                    Storage::disk('public')->delete($profile->$field);
                }
                if ($field === 'foto') {
                    $validated[$field] = \App\Services\ImageService::convertToWebp($request->file($field), $dir);
                } else {
                    $validated[$field] = $request->file($field)->store($dir, 'public');
                }
            } else {
                unset($validated[$field]);
            }
        }

        $profile->update($validated);
    }
}
